// Copyright (C) 2022  Xenorio
// See license in /LICENSE

const express = require('express')
const fs = require('fs')

const app = express()

let client

let paths = {}

let files = fs.readdirSync('./src/api/routes')
files.forEach(file => {
    let route = require(`./routes/${file}`)
    paths[route.path] = route
})

app.use(express.json())
app.use(express.urlencoded({extended: true}))

app.use((req, res, next) => {

    let path = req.originalUrl.split('?')[0]
    console.log(path)
    let route = paths[path]

    if (!route) return res.status(404).send('404 - Not Found')

    if (!route[req.method]) return res.status(404).send('404 - Not Found - Incorrect Request Method')

    route[req.method](client, req, res, next)

})

module.exports.start = (client, port) => {
    this.client = client
    app.listen(port, err => {
        if (err) return console.error(err)
        console.log(`API Listening on port ${port}`)
    })
}