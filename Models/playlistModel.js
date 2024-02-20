const mongoose = require('mongoose')

const playlistSchema = mongoose.Schema({
    name: {
        type: String,
        required: true,
        unique: true
    },
    owner: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "user",
    },
    poster: {
        type: String,
        default: '/images/song.png'
    },
    songs: [
        {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'song'
    },
],
playlistadd: {
    type: Boolean,
    default: true
   }
})

const playlistModel = mongoose.model('playList', playlistSchema)

module.exports = playlistModel