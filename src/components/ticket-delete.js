// Copyright (C) 2022  Xenorio
// See license in /LICENSE

const mongo = require('../mongo')

module.exports.execute = async(client, interaction) => {

    if (!(await mongo.queryOne('Tickets', { channel: interaction.channel.id }))) {
        interaction.createMessage({
            content: `<@615943893703458837>\n\n<@${interaction.member.id}> issued "ticket-delete" component outside of ticket. Please check what happened.`
        })
        return
    }

    interaction.acknowledge()

    mongo.delete('Tickets', { channel: interaction.channel.id })

    interaction.channel.delete()

}