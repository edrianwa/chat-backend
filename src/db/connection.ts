import knex, { Knex } from 'knex';
import knexConfig from './knexfile';
import { config } from '../config';

const env = config.isTest ? 'test' : config.nodeEnv;
const connectionConfig = knexConfig[env] || knexConfig.development;

const db: Knex = knex(connectionConfig);

export default db;
