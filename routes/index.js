var express = require('express');
var router = express.Router();
var users = require('../Models/userModel')
var songModel = require('../Models/songModel')
var playlistModel = require('../Models/playlistModel')
var passport = require('passport');
var localStrategy = require('passport-local')
var multer = require('multer')
var path = require('path')
var fs = require('fs')
const { Readable } = require('stream')
var id3 = require('node-id3')

passport.use(new localStrategy(users.authenticate()))
const mongoose = require('mongoose');
var crypto = require('crypto');
const userModel = require('../Models/userModel');


mongoose.connect('mongodb://0.0.0.0/spotify-15').then(() => {
  console.log('connected to db');
})
  .catch((err) => {
    console.log(err)
  })

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, './public/images/uploads')
  },

  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname)
    cb(null, file.fieldname + '-' + uniqueSuffix)
  }
})

const send = multer({ storage: storage })

router.post('/profile', isLoggedIn, send.single("image"), function (req, res, next) {
  users
    .findOne({ username: req.session.passport.user })
    .then(function (data) {
      if (data.image !== 'def.png') {
        // fs.unlinkSync(`./images/uploads/${data.image}`);
      }
      data.image = req.file.filename;
      data.save()
        .then(function () {
          res.redirect("back")
        })
    })
})

const conn = mongoose.connection
var gfsBucket, gfsBucketPoster
conn.once('open', () => {
  gfsBucket = new mongoose.mongo.GridFSBucket(conn.db, {
    bucketName: 'audio'
  })
  gfsBucketPoster = new mongoose.mongo.GridFSBucket(conn.db, {
    bucketName: 'poster'
  })
})

/* GET home page. */
router.get('/', isLoggedIn, async function (req, res, next) {
  const currentUser = await userModel.findOne({
    _id: req.user._id
  }).populate('playList').populate({
    path: 'playList',
    populate: {
      path: 'songs',
      model: 'song'
    }
  })
  const playlist = await playlistModel.find()
  res.render('index', { currentUser, playlist });
});


router.get('/poster/:posterName', (req, res, next) => {
  gfsBucketPoster.openDownloadStreamByName(req.params.posterName).pipe(res)
})

// This is user register code
router.post('/register', (req, res, next) => {
  var newUser = {
    username: req.body.username,
    email: req.body.email,
    image: req.body.image,
    contact: req.body.contact,
  }
  users.register(newUser, req.body.password)
    .then((result) => {
      passport.authenticate('local')(req, res, async function () {
        const songs = await songModel.find()
        const defaultPlaylist = await playlistModel.create({
          name: req.body.username,
          owner: req.user._id,
          songs: songs.map(song => song._id),
        })

        const newUser = await userModel.findOne({
          _id: req.user._id
        })

        newUser.playList.push(defaultPlaylist._id)
        await newUser.save()

        res.redirect('/')
      })
    })
    .catch((err) => {
      res.send(err)
    })
})

router.get('/profile', isLoggedIn, async function (req, res, next) {
  const currentUser = await userModel.findOne({username: req.session.passport.user})
  res.render('profile', { currentUser });
})

router.get('/uploadMusic', isLoggedIn, isAdmin, (req, res, next) => {
  res.render('uploadmusic')
})

router.get('/login', (req, res, next) => {
  res.render('register', {error: req.flash('error')})
})

// This is login code

router.post('/login', passport.authenticate('local',
  {
    successRedirect: '/',
    failureRedirect: '/login',
    failureFlash: true
  }),
  function (req, res, next) { }
);

// This is logout code

router.post('/logout', (req, res, next) => {
  if (req.isAuthenticated())
    req.logout((err) => {
      if (err) res.send(err)
      else res.redirect('/')
    });
  else {
    res.redirect('/');
  }
})


// Code for check is user loggedin or not 

function isLoggedIn(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  else {
    res.redirect('/login')
  }
}

function isAdmin(req, res, next) {
  if (req.user.isAdmin) {
    return next();
  }
  else {
    res.redirect('/login')
  }
}

const save = multer.memoryStorage()
const upload = multer({ save: save })

router.post("/uploadMusic", isLoggedIn, isAdmin, upload.array('song'), async (req, res, next) => {

  await Promise.all(req.files.map(async (file) => {
    const songData = id3.read(file.buffer)
    const randomName = crypto.randomBytes(20).toString('hex')
    Readable.from(file.buffer).pipe(gfsBucket.openUploadStream(randomName))
    Readable.from(songData.image.imageBuffer).pipe(gfsBucketPoster.openUploadStream(randomName + 'poster'))

    await songModel.create({
      title: songData.title,
      artist: songData.artist,
      albulm: songData.album,
      size: file.size,
      poster: randomName + 'poster',
      fileName: randomName
    })
  }))
  res.send("Song uploaded")
})


router.get('/stream/:musicName', async (req, res, next) => {
  const currentSong = await songModel.findOne({
    fileName: req.params.musicName
  })

  const stream = gfsBucket.openDownloadStreamByName(req.params.musicName)

  res.set('Content-Type', 'audio/mpeg')
  res.set('Content-Length', currentSong.size + 1)
  res.set('Content-Range', `bytes 0-${currentSong.size - 1}/${currentSong.size}`)
  res.set('Content-Ranges', 'byte')
  res.status(206)

  stream.pipe(res)
})


router.get('/search', isLoggedIn , async (req, res, next) => {
  const currentUser = await userModel.findOne({username: req.session.passport.user}).populate('playList').populate({
    path: 'playList',
    populate: {
      path: 'songs',
      model: 'song'
    }
  })
  res.render('search', { currentUser });
});

router.post('/search', isLoggedIn, async (req, res, next) => {

  const searchTerm = req.body.search;
  const regex = new RegExp(searchTerm, 'i')
  const searhedMusic = await songModel.find({
    title: { $regex: regex }
  })
  res.json({
    songs: searhedMusic
  })
})

router.post('/createPlaylist', isLoggedIn, async (req, res) => {
  const playlistName = req.body.name;

    // Create a new playlist in the database
    const playlist = await playlistModel.create({
      name: playlistName,
      owner: req.user._id,
      songs: [], // Initially, the playlist has no songs
    });

    // Add the new playlist to the user's playlists
    req.user.playList.push(playlist._id);
    await req.user.save();

    res.redirect('/');

});

router.post('/deletePlaylist/:playlistId', isLoggedIn, async (req, res) => {
  const playlistId = req.params.playlistId;

  // Find the playlist by ID and remove it
    await playlistModel.findByIdAndRemove(playlistId).exec();

    // Remove the playlist ID from the user's playlists
    req.user.playList = req.user.playList.filter(id => id.toString() !== playlistId);
    await req.user.save();

    res.redirect('/');

});

router.get('/liked', isLoggedIn, async (req, res) => {
  const likedSongs = await songModel.find({ liked: true });
  const currentUser = await userModel.findOne({username: req.session.passport.user}).populate('playList').populate({
    path: 'playList',
    populate: {
      path: 'songs',
      model: 'song'
    }
  })
  res.render('liked', { likedSongs, currentUser });
});

router.post('/like/:songId', isLoggedIn, async (req, res) => {
    const song = await songModel.findById(req.params.songId);
    const user =  await users.findOne({username: req.session.passport.user})

    if (song.likes.indexOf(user._id) === -1) {
      song.likes.push(user._id);
      song.liked = true;
    }
    else {
      song.likes.splice(song.likes.indexOf(user._id), 1);
      song.liked = false;
    }
    await song.save();
    res.redirect('back')
});

router.get('/playlist/:playlistId', isLoggedIn, async (req, res) => {
        const playlistId = req.params.playlistId;
        console.log('Playlist ID:', playlistId);
        const playlist = await playlistModel.findById(playlistId).populate('songs');
        const currentUser = await userModel.findOne({username: req.session.passport.user}).populate('playList').populate({
          path: 'playList',
          populate: {
            path: 'songs',
            model: 'song'
          }
        })
        res.render('playlist', { playlist, currentUser });
});

router.post('/playlist/:playlistId/addSong/:songId', isLoggedIn, async (req, res) => {

        const playlistId = req.params.playlistId;
        const songId = req.params.songId;
    
        // Find the playlist by ID
        const playlist = await playlistModel.findById(playlistId);
    
        playlist.playlistadd = true
        playlist.songs.push(songId);
        await playlist.save();
    
        // Redirect back to the playlist details page
        res.redirect(`/playlist/${playlistId}`);

});

router.post('/playlist/:playlistId/removeSong/:songId', isLoggedIn, async (req, res) => {
    const playlistId = req.params.playlistId;
    const songId = req.params.songId;

    // Find the playlist by ID
    const playlist = await playlistModel.findById(playlistId);

    playlist.playlistadd = false
    playlist.songs = playlist.songs.filter(id => id.toString() !== songId);
    await playlist.save();

    // Redirect back to the playlist details page
    res.redirect(`/playlist/${playlistId}`);

});

router.get('/edit', isLoggedIn, async function (req, res, next) {
  const currentUser = await userModel.findOne({username: req.session.passport.user}).populate('playList').populate({
    path: 'playList',
    populate: {
      path: 'songs',
      model: 'song'
    }
  })
  res.render('edit', { currentUser });
})

router.post('/update', isLoggedIn, function (req, res, next) {
  users
  .findOneAndUpdate({username: req.session.passport.user}, {username: req.body.username}, {new: true})
  .then(function(updateduser){
    req.login(updateduser, function(err) {
      if (err) { return next(err); }
      return res.redirect('/profile');
    });
  })
});
   
module.exports = router;
