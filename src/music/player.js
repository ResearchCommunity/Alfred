// Copyright (C) 2022  Xenorio
// See license in /LICENSE

const { client } = require('../index')
const YTDlp = require('yt-dlp-wrap').default
const playlist = require('./playlist')
const config = require('../../config')

const ytdl = new YTDlp()

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

    connection.on('error', err => {
        console.error(err)
        play()
    })

}

async function play() {
    if (!connection) await join()
    currentSong = await playlist.next()
    console.log(`Playing | ${currentSong.title}`)

    let stream

    try {

        stream = ytdl.execStream([
            `https://www.youtube.com/watch?v=${currentSong.resourceId.videoId}`,
            '-f',
            'bestaudio/best',
        ]);

    } catch (error) {
        // If video could not be accessed for any reason, play the next one
        console.error(error)
        return play()
    }

    connection.play(stream)

}

module.exports = {
    play
}