const mongoose = require('mongoose');
 
const plm = require('passport-local-mongoose')

const userSchema = mongoose.Schema({
    username: String,
    email: String,
    contact: String,
    playList: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: "playList"
        }
    ],
    liked: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: "song"
        }
    ],
    image: {
        type: String,
        default: 'def.png'
    },  
    isAdmin: {
        type: Boolean,
        default: false
    },
})

userSchema.plugin(plm)

const userModel = mongoose.model('User', userSchema)

module.exports = userModel