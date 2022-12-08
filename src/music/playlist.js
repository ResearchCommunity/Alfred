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

const yt = require('youtube-api');
const ms = require('ms')
const config = require('../../config')

yt.authenticate({
    type: 'key',
    key: config.keys.youtube
})

let playlist = []
let listindex = 0

module.exports.init = () => {
    return new Promise((resolve, reject) => {

        setInterval(() => {
            this.load(() => {
                if (config.music.shuffle) shuffle()
            })
        }, ms(config.music.refresh))

        this.load(() => {
            if (config.music.shuffle) shuffle()
            resolve()
        })

    })
}

// Recursively loads all items from a YouTube playlist and adds them to playlist array
module.exports.load = (cb, page) => {
    yt.playlistItems.list({
        part: 'snippet',
        playlistId: config.music.playlist,
        maxResults: 50,
        pageToken: page
    }, (err, res) => {
        if (err) return console.error(err)
        let data = res.data
        let items = data.items

        items.forEach(item => {
            if (item.snippet.title == "Deleted video") return
            playlist.push(item.snippet)
        })

        if (data.nextPageToken) {
            this.load(cb, data.nextPageToken)
        } else {
            cb()
        }

    })
}

// Returns the next playlist item. Loads the playlist if it's empty.
//
// Relevant response parameters:
// {
//     publishedAt: String,
//     channelId: String,
//     title: String,
//     description: String,
//     thumbnails: {
//         default: {
//             url: String,
//             width: Number,
//             height: Number
//         }
//         ... medium, high, standard, maxres
//     },
//     videoOwnerChannelTitle: String,
//     resourceId: {
//         videoId: String
//     }                  
// }

module.exports.next = () => {
    return new Promise(async(resolve, reject) => {

        if (!playlist[0]) await this.init()

        let item = playlist[listindex]

        listindex++

        if (listindex > playlist.length - 1) {
            listindex = 0
            if (config.music.shuffle) shuffle()
        }

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