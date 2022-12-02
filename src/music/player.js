// Copyright (C) 2022  Xenorio
// See license in /LICENSE

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

    connection.on('ready', () => {
        play()
    })

    connection.on('end', () => {
        play()
    })

    connection.on('disconnect', () => {
        play()
    })

    connection.on('error', (error) => {
        console.error(error)
        play()
    })

}

async function play() {
    if (!connection) return join()
    currentSong = await playlist.next()
    console.log(`Playing | ${currentSong.title}`)

    let stream

    try {
        stream = ytdl(`https://www.youtube.com/watch?v=${currentSong.resourceId.videoId}`, {
            filter: 'audioonly',
            format: config.music.format,
            highWaterMark: 1 << 25,
            requestOptions: {
                family: 4 // Force IPv4
            }
        })
    } catch (error) {
        console.error(error)
        // If video could not be accessed for any reason, play the next one
        return play()
    }

    connection.play(stream)

}

module.exports = {
    play
}