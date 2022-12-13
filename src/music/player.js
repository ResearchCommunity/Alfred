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

player.on('error', err => {
    setTimeout(play, 5000)
})

const guild = client.guilds.resolve(config.guild)
let channel = guild.channels.resolve(config.music.channel)
let ipv6 = false

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
        setTimeout(play, 5000)
        return
    }

    player.play(stream)

}

function nowPlaying() {
    return currentSong
}

function createStream() {
    ipv6 = !ipv6
    console.log(`Using ipv${ipv6 ? 6 : 4}`) // In case there are issues with one of them
    return createAudioResource(ytdl(`https://www.youtube.com/watch?v=${currentSong.resourceId.videoId}`, {
        filter: 'audioonly',
        format: config.music.format,
        highWaterMark: 1 << 25,
        requestOptions: {
            family: ipv6 ? 6 : 4 // Switch between ipv4 and ipv6 every time. Cheap way to double ratelimits ^^
        }
    }))
}

module.exports = {
    play,
    nowPlaying
}