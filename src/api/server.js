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

const express = require('express')
const fs = require('fs')
const pathmod = require('path')

const app = express()

let discord

let paths = {}
let staticPaths = []

let files = fs.readdirSync('./src/api/routes')
files.forEach(file => {
    let route = require(`./routes/${file}`)
    paths[route.path] = route
})

let staticFiles = fs.readdirSync('./src/api/static')
staticFiles.forEach(file => {
    staticPaths.push(`/${file}`)
})

app.use(express.json())
app.use(express.urlencoded({extended: true}))

app.use((req, res, next) => {

    let path = req.originalUrl.split('?')[0]
    let route = paths[path]

    if (!route) {

		if(staticPaths.includes(path)) {
			return res.sendFile(pathmod.resolve(`src/api/static${path}`))
		}

		return res.status(404).send('404 - Not Found')
	}

    if (!route[req.method]) return res.status(404).send('404 - Not Found - Incorrect Request Method')

    route[req.method](discord, req, res, next)

})

module.exports.start = (client, port) => {
    discord = client
    app.listen(port, err => {
        if (err) return console.error(err)
        console.log(`API Listening on port ${port}`)
    })
}