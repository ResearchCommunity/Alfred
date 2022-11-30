// Copyright (C) 2022  Xenorio
// See license in /LICENSE

const { client } = require('../index')
const fs = require('fs')
const config = require('../../config')

const guild = client.guilds.get(config.guild)
let channel = guild.channels.get(config.music.channel)

let currentSong
let playlist = []
let index = 0

let connection

async function join() {
    connection = await channel.join({
        selfDeaf: true
    })

    connection.on('end', () => {
        console.log('end')
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

function load() {
    return new Promise((resolve, reject) => {
        let files = fs.readdirSync('./music')
        files.forEach(file => {
            if (!file.endsWith('.mp3')) return
            playlist.push(file)
        })
        resolve()
    })
}

function next() {
    return new Promise(async(resolve, reject) => {
        if (!playlist[0]) await load()
        let item = playlist[index]
        index += 1
        if (index > playlist.length - 1) index = 0
        resolve(item)
    })
}

async function play() {
    if (!connection) await join()
    currentSong = await next()
    console.log(`Playing | ${currentSong}`)

    connection.play(`./music/${currentSong}`)

}

module.exports = {
    play
}