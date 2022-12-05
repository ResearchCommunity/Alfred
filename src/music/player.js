// Copyright (C) 2022  Xenorio
// See license in /LICENSE

const { client } = require('../index')
const ytdl = require('ytdl-core')
const playlist = require('./playlist')
const config = require('../../config')
const {
    createAudioPlayer,
    NoSubscriberBehavior,
    createAudioResource,
    joinVoiceChannel,
    VoiceConnectionStatus,
    AudioPlayerStatus
} = require('@discordjs/voice')

const player = createAudioPlayer({
    behaviors: {
        noSubscriber: NoSubscriberBehavior.Pause,
    },
})

player.on(AudioPlayerStatus.Idle, () => {
    play()
})

const guild = client.guilds.resolve(config.guild)
let channel = guild.channels.resolve(config.music.channel)

let currentSong

let connection

async function join() {
    let connection = await joinVoiceChannel({
        channelId: channel.id,
        guildId: channel.guild.id,
        adapterCreator: channel.guild.voiceAdapterCreator
    })

    connection.subscribe(player)

    connection.on(VoiceConnectionStatus.Disconnected, () => {
        join()
    })

    connection.on(VoiceConnectionStatus.Destroyed, () => {
        join()
    })

}

async function play() {
    if (!connection) await join()
    currentSong = await playlist.next()
    console.log(`Playing | ${currentSong.title}`)

    let stream

    try {
        stream = createAudioResource(ytdl(`https://www.youtube.com/watch?v=${currentSong.resourceId.videoId}`, {
            filter: 'audioonly',
            format: config.music.format,
            highWaterMark: 1 << 25,
            requestOptions: {
                family: 4 // Force IPv4. There are server-specific reasons for this. Just trust that they are good ones.
            }
        }))
    } catch (error) {
        console.error(error)
            // If video could not be accessed for any reason, play the next one
        return play()
    }

    player.play(stream)

}

module.exports = {
    play
}