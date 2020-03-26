require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const ejs = require('ejs');
const mongoose = require('mongoose');
const app = express();
const session = require('express-session');
const passport = require('passport');
const passportLocalMongoose = require('passport-local-mongoose');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const findOrCreate = require('mongoose-findorcreate');
const FacebookStrategy = require('passport-facebook').Strategy;
const GithubStrategy = require('passport-github2').Strategy;
const https = require('https');
const http = require('http');
const fs = require('fs');

app.use(bodyParser.urlencoded({extended: true}));
app.use(express.static('public'));
app.set('view engine', 'ejs');

const optionsSSL = {
    key: fs.readFileSync('akash-key.pem'),
    cert: fs.readFileSync('akash-cert.pem')
};


app.use(session({
    secret: "Hey my name is Akash.",
    resave: false,
    saveUninitialized: false
}));

app.use(passport.initialize());
app.use(passport.session());

if(process.env.ENV === "PROD")
{
const dbUser = process.env.DB_USER;
const dbPass = process.env.DB_PASS;
const dbURL = 'mongodb+srv://' + dbUser + ':' + dbPass + '@cluster0-qnmpu.mongodb.net/secretsDB';
mongoose.connect(dbURL,  { useNewUrlParser: true,  useUnifiedTopology: true, useFindAndModify: false});
} else {
    mongoose.connect("mongodb://localhost:27017/secretsDB", { useNewUrlParser: true,  useUnifiedTopology: true, useFindAndModify: false});
}
mongoose.set("useCreateIndex", true);

const userSchema = new mongoose.Schema({
    email: String,
    password: String,
    googleId: String,
    username: String,
    facebookId: String,
    githubId: String,
    secret: String
});

userSchema.plugin(passportLocalMongoose);
userSchema.plugin(findOrCreate);

const User = mongoose.model("User", userSchema);

passport.use(User.createStrategy());
passport.serializeUser((user, done) => {
    done(null, user.id)
});
passport.deserializeUser((id, done) => {
    User.findById(id, (err, user) => {
        done(err, user);
    });
});

if(process.env.ENV === "PROD") {
passport.use(new GoogleStrategy({
    clientID: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    callbackURL: "https://evening-atoll-03139.herokuapp.com/auth/google/secrets",
    userProfileURL: "https://www.googleapis.com/oauth2/v3/userinfo"
  },
  function(accessToken, refreshToken, profile, cb) {    
    User.findOrCreate({ googleId: profile.id, username: profile.name.givenName }, function (err, user) {
      return cb(err, user);
    });
  }
));
} else {
    passport.use(new GoogleStrategy({
        clientID: process.env.CLIENT_ID,
        clientSecret: process.env.CLIENT_SECRET,
        callbackURL: "http://localhost:3000/auth/google/secrets",
        userProfileURL: "https://www.googleapis.com/oauth2/v3/userinfo"
      },
      function(accessToken, refreshToken, profile, cb) {
        const proName = profile.name.givenName;
        User.findOrCreate({ googleId: profile.id, username: profile.name.givenName }, function (err, user) {
          return cb(err, user);
        });
      }
    ));
}

if(process.env.ENV === "PROD"){
    passport.use(new FacebookStrategy({
        clientID: process.env.FACEBOOK_ID,
        clientSecret: process.env.FACEBOOK_SECRET,
        callbackURL: "https://evening-atoll-03139.herokuapp.com/auth/facebook/callback"
    },
    (accessToken, refreshToken, profile, cb) => {
        User.findOrCreate({facebookId: profile.id }, (err, user) => {
            return cb(err, user);
        });
    }
    ));
} else {
    passport.use(new FacebookStrategy({
        clientID: process.env.FACEBOOK_ID,
        clientSecret: process.env.FACEBOOK_SECRET,
        callbackURL: 'https://localhost:443/auth/facebook/callback'
    },
    (accessToken, refreshToken, profile, cb) => {
        User.findOrCreate({facebookId: profile.id }, (err, user) => {
            return cb(err, user);
        });
    }
    ));
}

passport.use(new GithubStrategy({
    clientID: process.env.GITHUB_ID,
    clientSecret: process.env.GITHUB_SECRET,
    callbackURL: 'https://localhost:443/auth/github/callback'
},
(accessToken, refreshToken, profile, cb) => {
    console.log(profile);
    User.findOrCreate({githubId: profile.id, username : profile.username }, (err, user) => {
        return cb(err, user);
    })
}))

app.get("/", (req, res) => {
    res.render('home');
});

app.get("/auth/google", 
    passport.authenticate('google', {scope: ['profile']}));

app.get("/auth/google/secrets", 
    passport.authenticate('google', { failureRedirect: '/login'}),
    (req, res) => {
        res.redirect('/secrets');
    });

app.get("/auth/facebook", 
    passport.authenticate('facebook'));

app.get("/auth/facebook/callback", 
    passport.authenticate('facebook', {failureRedirect: '/login'}),
    (req, res) => {
        res.redirect('/secrets');
    });

app.get("/auth/github", 
    passport.authenticate('github', {scope: ['user: email']}));

app.get("/auth/github/callback", 
    passport.authenticate('github', {failureRedirect: '/login'}),
    (req,res) => {
        res.redirect('/secrets');
    });

app.get("/login", (req, res) => {
    res.render('login');
});

app.get("/register", (req, res) => {
    res.render('register');
});

app.get("/secrets", (req, res) => {
    User.find({"secret": {$ne: null}}, (err, foundSecrets) => {
        if(err){
            console.log(err);            
        } else {
                res.render('secrets', {userStoredSecret: foundSecrets});
        }
    });
});

app.get("/submit", (req, res) => {
    if(req.isAuthenticated()){
        res.render("submit");
    } else {
        res.redirect('/login');
    }
   
});

app.get("/logout", (req, res) => {
    req.logout();
    res.redirect('/')
})

app.post("/submit", (req, res) => {
    const submittedSecret = req.body.secret;
    
    User.findById(req.user.id, (err, foundUser) => {
        if(err) {
            console.log(err);            
        } else {
            if(foundUser){
                foundUser.secret = submittedSecret;
                foundUser.save(() => {
                    res.redirect("/secrets")
                });
            }
        }
    });
});


app.post("/register", (req, res) => {  
    User.register({username: req.body.username}, req.body.password, (err, user) => {
        if(err) {
            console.log(err);
            res.redirect("/register");
        } else {
            passport.authenticate("local") (req, res, () => {
                res.redirect("/secrets");
            });
        }
    });
});

app.post("/login", (req, res) => {
    const user = new User({
        username: req.body.username,
        password: req.body.password
    });
    req.login(user, (err) => {
        if(err) {
            console.log(err);            
        } else {
            passport.authenticate("local") (req, res, () => {
                res.redirect("/secrets");
            });
        }
    });
});

if(process.env.ENV === "PROD"){
    const port = process.env.PORT;
    app.listen(port, () =>{
        console.log("App started at localhost:" + port);
        
    })
} else {
    const port = 3000;
    http.createServer(app).listen(port, () =>{
        console.log("App started at localhost:" + port);
        
    });
    https.createServer(optionsSSL, app).listen(443, () => {
        console.log("App running on https://localhost:443");
    });
}
