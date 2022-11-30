// Copyright (C) 2022  Xenorio
// See license in /LICENSE

const config = require('../../config')

module.exports = async(client) => {

    console.log('Ready to rumble!')

    let player

    if (config.music.emergency) {
        player = '../music/emergency-player'
    } else {
        player = '../music/player'
    }

    require(player).play()

}