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
const mongo = require('../mongo')

module.exports = async(client, oldThread, newThread) => {

    if (oldThread.archived != newThread.archived && newThread.archived == true) {
        mongo.queryOne('Threads', { id: newThread.id })
            .then(data => {
                if(data.watched)newThread.setArchived(false, 'Thread Watch')
            })
    }

}