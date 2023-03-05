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
const playlist = require('./playlist')
const playlistLocal = require('./playlist-local')
const config = require('../../config')
const {
    createAudioPlayer,
    NoSubscriberBehavior,
    createAudioResource,
    joinVoiceChannel,
    VoiceConnectionStatus,
    AudioPlayerStatus
} = require('@discordjs/voice')
const mongo = require('../mongo')

let local = true

mongo.queryOne('Settings', { name: 'music-mode' })
    .then(data => {
        if (!data) return mongo.insert('Settings', {
            name: 'music-mode',
            value: true
        })
        local = data.value
    })

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

let currentSong

let connection

async function join() {

    if (connection) connection.removeAllListeners()

    connection = await joinVoiceChannel({
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

    // Temporary workaround due to Discord API changes
    connection.on('stateChange', (oldState, newState) => {
        const oldNetworking = Reflect.get(oldState, 'networking');
        const newNetworking = Reflect.get(newState, 'networking');

        const networkStateChangeHandler = (oldNetworkState, newNetworkState) => {
            const newUdp = Reflect.get(newNetworkState, 'udp');
            clearInterval(newUdp?.keepAliveInterval);
        }

        oldNetworking?.off('stateChange', networkStateChangeHandler);
        newNetworking?.on('stateChange', networkStateChangeHandler);
    });

}

async function play() {
    if (!connection) await join()

    if (local) {
        currentSong = await playlistLocal.next()
    } else {
        currentSong = await playlist.next()
    }

    console.log(`Playing | ${currentSong.title}`)

    player.play(currentSong.resource)

}

function nowPlaying() {
    return currentSong
}

function switchLocal() {
    local = !local
    mongo.update('Settings', { name: 'music-mode' }, { value: local })
    return local
}

module.exports = {
    play,
    nowPlaying,
    switchLocal
}