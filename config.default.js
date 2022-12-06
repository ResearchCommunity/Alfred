module.exports = {

    keys: {
        discord: "BOT TOKEN",
        youtube: "YOUTUBE API KEY"
    },

    guild: "GUILD ID",

    // Presence data
    //
    // Activity types:
    // 0 - Playing
    // 1 - Streaming
    // 2 - Listening
    // 3 - Watching
    presence: {
        status: 'online',
        activities: [{
            name: 'Doing Something',
            type: 0
        }]
    },

    music: {
        channel: "VOICE CHANNEL ID",
        playlist: "YOUTUBE PLAYLIST ID", // Only public and unlisted playlists supported
        shuffle: false,
        format: 'bestaudio/best', // ytdl-core format
        refresh: '1h' // How often the playlist should be refreshed
    },

    database: {
        url: 'mongodb://127.0.0.1:27017', // MongoDB connection string
        name: 'ResearchCommunity-Alfred'
    },

    tickets: {
        category: '', // ID of channel category to put tickets in
        tripsitter: '' // ID of tripsitter role
    },

    rules: {
        embed: {
            // Embed Data
        }
    }

}