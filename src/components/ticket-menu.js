// Copyright (C) 2022  Xenorio
// See license in /LICENSE

module.exports.execute = async(client, interaction) => {

    switch (interaction.data.values[0]) {
        case 'ticket-creation-message':
            interaction.acknowledge()
            interaction.channel.createMessage({
                content: 'Is your trip going south? Need some assistance or just someone to talk to? Our volunteer tripsitters are here for you!',
                components: [{
                    type: 1, // Collection
                    components: [{
                        type: 2, // Button
                        style: 1, // Blue
                        custom_id: 'ticket-create',
                        label: 'Tripsit Me!'
                    }]
                }]
            })
            break;

        default:
            break;
    }

}