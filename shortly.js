var express = require('express');
var util = require('./lib/utility');
var partials = require('express-partials');
var bodyParser = require('body-parser');
var cookieParser = require('cookie-parser');
// set up github authentication*************
var passport = require('passport');
var session = require('express-session');
var methodOverride = require('method-override');
var GitHubStrategy = require('passport-github2').Strategy;
//******************************************

var db = require('./app/config');
var Users = require('./app/collections/users');
var User = require('./app/models/user');
var Links = require('./app/collections/links');
var Link = require('./app/models/link');
var Click = require('./app/models/click');
var passwordHash = require('password-hash');


// Github application information*********************************************************************

var GITHUB_CLIENT_ID = '6b8332d739543918a0c1';
var GITHUB_CLIENT_SECRET = 'b0a26df6f21c5b4e557423840f43771d8442b895';

passport.serializeUser(function(user, done) {
  done(null, user);
});

passport.deserializeUser(function(obj, done) {
  done(null, obj);
});

passport.use(new GitHubStrategy({
  clientID: GITHUB_CLIENT_ID,
  clientSecret: GITHUB_CLIENT_SECRET,
  callbackURL: 'http://127.0.0.1:4568/auth/github/callback'
},
  function(accessToken, refreshToken, profile, done) {
    // asynchronous verification, for effect...
    process.nextTick(function () {
      
      // To keep the example simple, the user's GitHub profile is returned to
      // represent the logged-in user.  In a typical application, you would want
      // to associate the GitHub account with a user record in your database,
      // and return that user instead.
      return done(null, profile);
    });
  }
));

//****************************************************************************************************

var app = express();

app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');
app.use(partials());
// Parse JSON (uniform resource locators)
app.use(bodyParser.json());
// Parse forms (signup/login)
app.use(bodyParser.urlencoded({ extended: true }));

//****************************************************************************************************
app.use(methodOverride());
app.use(session({ secret: 'keyboard cat', resave: false, saveUninitialized: false }));
// Initialize Passport!  Also use passport.session() middleware, to support
// persistent login sessions (recommended).
app.use(passport.initialize());
app.use(passport.session());
//****************************************************************************************************

app.use(express.static(__dirname + '/public'));

// Set up session and Cookie
app.use(cookieParser());
app.use(function(req, res, next) {
  console.log('serving a ' + req.method + ' request on ' + req.url);

  // if (req.method === 'GET' && (req.url === '/' || req.url === '/create' || req.url === '/links')) {
  //   if (req.cookies.loggedin === 'true') {
  //     next();
  //   } else {
  //     res.redirect('/login');
  //   }
  // }
  // next();

  if (req.url === '/*', req.url === '/login' || req.url === '/signup' || req.session.user) {
    next();
  } else {
    req.session.error = 'Access denied!';
    res.redirect('/login');
  }
});

var restrict = function(req, res, next) {
};


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
      if (passwordHash.verify(req.body.password, user.attributes.password)) {
        res.status(200);
        // res.cookie('loggedin', true);
        res.session.user = user;
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
  if (req.body.username && req.body.password) {
    console.log('req.body.username ', req.body.username);
    new User({ username: req.body.username }).fetch().then(function(found) {
      if (found) {
        res.status(200).send(found.attributes);
      } else {
        Users.create({
          username: req.body.username,
          password: passwordHash.generate(req.body.password)
        })
        .then(function(newUser) {
          // res.cookie('loggedin', true);
          req.session.user = newUser;
          res.redirect('/');
        });
      }
    });
  } else {
    res.redirect('/signup');
  }
});

app.get('/logout', function(req, res) {
  // res.cookie('loggedin', false);
  req.session.destroy(function(err) {
    if (err) {
      console.error(err);
    } else {
      res.redirect('/login');
    }
  });
});

/************************************************************/
// Write your github login routes here
/************************************************************/


app.get('/auth/github',
  passport.authenticate('github', { scope: [ 'user:email' ] }),
  function(req, res) {
    // The request will be redirected to GitHub for authentication, so this
    // function will not be called.
  });

// GET /auth/github/callback
//   Use passport.authenticate() as route middleware to authenticate the
//   request.  If authentication fails, the user will be redirected back to the
//   login page.  Otherwise, the primary route function will be called,
//   which, in this example, will redirect the user to the home page.
app.get('/auth/github/callback', 
  passport.authenticate('github', { failureRedirect: '/login' }),
  function(req, res) {
    // console.log('req back from github: ', req);
    res.cookie('loggedin', true);
    res.redirect('/');
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
