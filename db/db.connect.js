const mongoose = require('mongoose');

require('dotenv').config();

const MONGOURI = process.env.MONGODB;
let connectionPromise;

const initializeDB = async () => {
    if (mongoose.connection.readyState === 1) {
        return mongoose.connection;
    }

    if (!MONGOURI) {
        throw new Error("MONGODB must be configured");
    }

    if (!connectionPromise || mongoose.connection.readyState === 0) {
        connectionPromise = mongoose.connect(MONGOURI)
            .then(() => {
                console.log("DB Connected successfully!!");
                return mongoose.connection;
            })
            .catch((error) => {
                connectionPromise = null;
                throw error;
            });
    }

    return connectionPromise;
};

module.exports = { initializeDB };

