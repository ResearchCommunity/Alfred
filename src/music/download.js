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
const ms = require('ms')
const ytdlp = require('youtube-dl-exec')
const config = require('../../config')
const fs = require('fs')

async function init() {
    setInterval(() => {
        download()
    }, ms('12h'))
}

function download() {
    return new Promise((resolve, reject) => {
        console.log('Downloading playlist')
        ytdlp(config.music.playlist, {
                extractAudio: true,
                audioFormat: 'mp3',
                writeInfoJson: true,
                format: 'ba',
                output: './music/%(title)s.%(ext)s',
                sponsorblockMark: 'music_offtopic',
                noCheckCertificates: true,
                noWarnings: true,
                ignoreErrors: true,
                quiet: true,
                addHeader: [
                    'referer:youtube.com',
                    'user-agent:googlebot'
                ]
            }).then(() => {
                fs.writeFileSync('./music/touched', 'This file indicates that music exists. You can safely ignore it.')
                resolve()
            })
            .catch(() => {
                fs.writeFileSync('./music/touched', 'This file indicates that music exists. You can safely ignore it.')
                resolve()
            })
    })
}

module.exports = {
    init,
    download
}