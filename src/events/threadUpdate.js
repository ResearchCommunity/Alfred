// Copyright (C) 2022  Xenorio
// See license in /LICENSE

const fs = require('fs')
const mongo = require('../mongo')

module.exports = async(client, oldThread, newThread) => {

    if (oldThread.archived != newThread.archived && newThread.archived == true) {
        mongo.queryOne('Threads', { id: newThread.id })
            .then(data => {
                if(data.watched)newThread.setArchived(false, 'Thread Watch')
            })
    }

}