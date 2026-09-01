const { Client } = require('pg');
process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0;
require('dotenv').config()

const client = new Client({
    connectionString: process.env.CONNECTION_STRING,
    ssl: process.env.DB_SSL === 'false' ? false : true,
});
client.asyncQuery = function (query, values) {
    return new Promise((resolve, reject) => {
        client.query(query, values, (err, res) => {
            if (err) {
                reject(err)
            } else {
                resolve(res.rows)
            }
        })
    })
}
module.exports = {
    connectToServer: async function () {
        return client.connect()
    },
    getClient: function () {
        return client
    }
};
