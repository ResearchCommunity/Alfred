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

const fs = require('fs')
const config = require('../../config')
const { createAudioResource } = require('@discordjs/voice')

let playlist = []
let listindex = 0

module.exports.init = () => {
    return new Promise((resolve, reject) => {

        this.load(() => {
            if (config.music.shuffle) shuffle()
            resolve()
        })

    })
}

// Recursively loads all items from a YouTube playlist and adds them to playlist array
module.exports.load = (cb) => {
    fs.readdirSync('./music').forEach(file => {
        if (!file.endsWith('.mp3')) return
        let jsonFile = file.split('.mp3')[0] + '.info.json'
        if (!fs.existsSync(`./music/${jsonFile}`)) return
        let data = require(`../../music/${jsonFile}`)
        playlist.push({
            publishedAt: (new Date(data.epoch)).toISOString(),
            title: data.title,
            description: data.description,
            thumbnails: {
                default: {
                    url: data.thumbnail,
                    width: 1,
                    height: 1
                }
            },
            videoOwnerChannelTitle: data.uploader,
            videoOwnerChannelId: data.uploader_id,
            resourceId: {
                videoId: data.id
            }

        })
    })

    cb()
}

// Returns the next playlist item. Loads the playlist if it's empty.
module.exports.next = () => {
    return new Promise(async(resolve, reject) => {

        if (!playlist[0]) await this.init()

        let item = playlist[listindex]

        listindex++

        if (listindex > playlist.length - 1) {
            listindex = 0
            if (config.music.shuffle) shuffle()
        }

        item.resource = createAudioResource(`./music/${file}`)

        resolve(item)
    })
}

// Shuffles the playlist
// https://www.w3docs.com/snippets/javascript/how-to-randomize-shuffle-a-javascript-array.html
function shuffle() {
    let index = playlist.length,
        randomIndex;

    // While there remain elements to shuffle.
    while (index != 0) {

        // Pick a remaining element.
        randomIndex = Math.floor(Math.random() * index);
        index--;

        // And swap it with the current element.
        [playlist[index], playlist[randomIndex]] = [
            playlist[randomIndex], playlist[index]
        ];
    }

}