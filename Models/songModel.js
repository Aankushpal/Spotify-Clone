const mongoose = require('mongoose');

const songSchema = mongoose.Schema({
    title: String,
    artist: String,
    album: String,
    category: [
        {
            type: String,
            enum: ['punjabi', 'Hindi']
        }
    ],
    likes: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: "user"
        }
    ],
    size: Number,
    poster: String,
    fileName: {
        type: String,
        required: true
    },
    liked: {
         type: Boolean,
         default: false 
        }
})

const songModel = mongoose.model('song', songSchema)

module.exports = songModel