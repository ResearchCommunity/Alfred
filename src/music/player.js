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

    // TODO: figure out why this doesn't fire. Needed to avoid race condition.
    //
    // connection.on('ready', () => {
    //     play()
    // })

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
    if (!connection) await join()
    currentSong = await playlist.next()
    console.log(`Playing | ${currentSong.title}`)

    let stream

    try {
        stream = ytdl(`https://www.youtube.com/watch?v=${currentSong.resourceId.videoId}`, {
            filter: 'audioonly',
            format: config.music.format,
            highWaterMark: 1 << 25,
            requestOptions: {
                family: 4 // Force IPv4. There are server-specific reasons for this. Just trust that they are good ones.
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