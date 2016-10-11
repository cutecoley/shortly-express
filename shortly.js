var express = require('express');
var util = require('./lib/utility');
var partials = require('express-partials');
var bodyParser = require('body-parser');
var cookieParser = require('cookie-parser');

var db = require('./app/config');
var Users = require('./app/collections/users');
var User = require('./app/models/user');
var Links = require('./app/collections/links');
var Link = require('./app/models/link');
var Click = require('./app/models/click');
var passwordHash = require('password-hash');
var app = express();

app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');
app.use(partials());
// Parse JSON (uniform resource locators)
app.use(bodyParser.json());
// Parse forms (signup/login)
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(__dirname + '/public'));

// Set up session and Cookie
app.use(cookieParser());
app.use(function(req, res, next) {
  console.log('serving a ' + req.method + ' request on ' + req.url);
  if (req.method === 'GET' && (req.url === '/' || req.url === '/create' || req.url === '/links')) {
    if (req.cookies.loggedin === 'true') {
      next();
    } else {
      res.redirect('/login');
    }
  }
  next();
});


app.get('/', 
function(req, res) {
  res.render('index');
});

app.get('/create', 
function(req, res) {
  res.render('index');
});

app.get('/links', 
function(req, res) {
  Links.reset().fetch().then(function(links) {
    res.status(200).send(links.models);
  });
});

app.post('/links', 
function(req, res) {
  var uri = req.body.url;

  if (!util.isValidUrl(uri)) {
    console.log('Not a valid url: ', uri);
    return res.sendStatus(404);
  }

  new Link({ url: uri }).fetch().then(function(found) {
    if (found) {
      res.status(200).send(found.attributes);
    } else {
      util.getUrlTitle(uri, function(err, title) {
        if (err) {
          console.log('Error reading URL heading: ', err);
          return res.sendStatus(404);
        }

        Links.create({
          url: uri,
          title: title,
          baseUrl: req.headers.origin
        })
        .then(function(newLink) {
          res.status(200).send(newLink);
        });
      });
    }
  });
});

/************************************************************/
// Write your authentication routes here
/************************************************************/

app.get('/login', function(req, res) {
  console.log('should re-render login page');
  res.render('login');
});

app.post('/login', function(req, res) {
  User.where('username', req.body.username).fetch().then(function(user) {
    if (user) {
      if (passwordHash.verify(req.body.password) === user.attributes.password) {
        res.status(200);
        res.cookie('loggedin', true);
        res.redirect('/');
      } else {
        res.render('login');
      }
    } else {
      res.redirect('/login');
    }
  });
});

app.get('/signup', function(req, res) {
  res.render('signup');
});

app.post('/signup', function(req, res) {
  new User({ username: req.body.username }).fetch().then(function(found) {
    if (found) {
      res.status(200).send(found.attributes);
    } else {
      Users.create({
        username: req.body.username,
        password: passwordHash.generate(req.body.password)
      })
      .then(function() {
        res.cookie('loggedin', true);
        res.redirect('/');
      });
    }
  });
});

app.get('/logout', function(req, res) {
  res.cookie('loggedin', false);
  res.redirect('/login');
});


/************************************************************/
// Handle the wildcard route last - if all other routes fail
// assume the route is a short code and try and handle it here.
// If the short-code doesn't exist, send the user to '/'
/************************************************************/

app.get('/*', function(req, res) {
  new Link({ code: req.params[0] }).fetch().then(function(link) {
    if (!link) {
      res.redirect('/');
    } else {
      var click = new Click({
        linkId: link.get('id')
      });

      click.save().then(function() {
        link.set('visits', link.get('visits') + 1);
        link.save().then(function() {
          return res.redirect(link.get('url'));
        });
      });
    }
  });
});

console.log('Shortly is listening on 4568');
app.listen(4568);
