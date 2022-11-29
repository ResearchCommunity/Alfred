const { client } = require('../index')
const ytdl = require('ytdl-core')
const playlist = require('./playlist')
const config = require('../../config')

const guild = client.guilds.get(config.guild)
let channel = guild.channels.get(config.music.channel)

let currentSong

let connection

async function join() {
    connection = await channel.join({
        selfDeaf: true
    })

    connection.on('end', () => {
        play()
    })

    connection.on('disconnect', () => {
        play()
    })

    connection.on('error', () => {
        play()
    })

}

async function play() {
    if (!connection) await join()
    currentSong = await playlist.next()
    console.log(`Playing | ${currentSong.title}`)

    let stream

    try {
        stream = ytdl(`https://www.youtube.com/watch?v=${currentSong.resourceId.videoId}`, {
            filter: 'audioonly',
            format: 'bestaudio/best'
        })
    } catch (error) {
        // If video could not be accessed for any reason, play the next one
        return play()
    }

    connection.play(stream)

}

module.exports = {
    play
}