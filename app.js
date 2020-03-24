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

app.use(bodyParser.urlencoded({extended: true}));
app.use(express.static('public'));
app.set('view engine', 'ejs');



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
    googleId: String
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
    User.findOrCreate({ googleId: profile.id }, function (err, user) {
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
        User.findOrCreate({ googleId: profile.id }, function (err, user) {
          return cb(err, user);
        });
      }
    ));
}

app.get("/", (req, res) => {
    res.render('home');
});

app.get("/auth/google", 
    passport.authenticate('google', {scope: ['profile']}));

app.get("/auth/google/secrets", 
    passport.authenticate('google', { failureRedirect: '/login'}),
    (req, res) => {
        res.redirect('/secrets');
    })

app.get("/login", (req, res) => {
    res.render('login');
});

app.get("/register", (req, res) => {
    res.render('register');
});

app.get("/secrets", (req, res) => {
    if(req.isAuthenticated()){
        res.render('secrets');
    } else {
        res.redirect("/login");
    }
})

app.get("/logout", (req, res) => {
    req.logout();
    res.redirect('/')
})


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
    const port = 3000 || process.env.PORT;
    app.listen(port, () =>{
        console.log("App started at localhost:" + port);
        
    })
}
