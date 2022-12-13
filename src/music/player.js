// Copyright(C) 2022 Marcus Huber (xenorio) 
// <dev@xenorio.xyz>

// This program is free software: you can redistribute it and / or modify
// it under the terms of the GNU Affero General Public License as published
// by the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
// See the GNU Affero General Public License for more details.

// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
// ######################################################################### //

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
        stream = createStream()
    } catch (error) {
        console.error(error)
        stream = await awaitYoutubeReady()
    }

    player.play(stream)

}

function nowPlaying() {
    return currentSong
}

// Checks if YouTube lets us stream again every 10 seconds, then resolves with the new stream
function awaitYoutubeReady() {
    return new Promise((resolve, reject) => {
        let readyInterval = setInterval(() => {

            try {
                stream = createStream()
            } catch (error) {
                return
            }

            resolve(stream)

            clearInterval(readyInterval)

        }, 10000)
    })
}

function createStream() {
    return createAudioResource(ytdl(`https://www.youtube.com/watch?v=${currentSong.resourceId.videoId}`, {
        filter: 'audioonly',
        format: config.music.format,
        highWaterMark: 1 << 25,
        requestOptions: {
            family: 4 // Force IPv4. There are server-specific reasons for this. Just trust that they are good ones.
        }
    }))
}

module.exports = {
    play,
    nowPlaying
}