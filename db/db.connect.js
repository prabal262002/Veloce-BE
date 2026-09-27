const mongoose = require('mongoose');

require('dotenv').config();

const MONGOURI = process.env.MONGODB;

const initializeDB = async()=>{
    await mongoose.connect(MONGOURI).then(()=>{
        console.log("DB Connected successfully!!");
    }).catch((err)=>{
        console.log("error!! - ",err);
    });
}

module.exports = { initializeDB };

