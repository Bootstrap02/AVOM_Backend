// Shared setup for API integration tests: in-memory MongoDB, mock storage, console-captured emails.
process.env.NODE_ENV = 'test';
process.env.EMAIL_MODE = 'log';
process.env.STORAGE_PROVIDER = 'mock';
process.env.RUN_JOBS = 'false';

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const request = require('supertest');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongod;
const sentEmails = [];

async function startDb() {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  // Emails are logged, not sent: capture them so tests can read activation links.
  jest.spyOn(console, 'info').mockImplementation((line) => { if (String(line).startsWith('[email:log]')) sentEmails.push(String(line)); });
  jest.spyOn(console, 'error').mockImplementation(() => {});
}

async function stopDb() {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
  jest.restoreAllMocks();
}

async function createUser({ email, role, name = 'Test User', password = 'Password123' }) {
  const User = require('../../src/models/User');
  return User.create({ email, role, name, status: 'active', passwordHash: await bcrypt.hash(password, 4) });
}

async function loginStaff(app, email, password = 'Password123') {
  const res = await request(app).post('/api/v1/auth/staff/login').send({ email, password });
  // Keep only name=value pairs so the Cookie header is clean.
  const cookies = (res.headers['set-cookie'] || []).map((c) => c.split(';')[0]);
  return { token: res.body.data?.accessToken, cookies, res };
}

// Newest email to an address, and the token inside its link.
const lastEmailTo = (to) => [...sentEmails].reverse().find((l) => l.includes(`to=${to} `));
const tokenFrom = (line) => (line.match(/token=([a-f0-9]+)/) || [])[1];

module.exports = { startDb, stopDb, createUser, loginStaff, lastEmailTo, tokenFrom, sentEmails };
