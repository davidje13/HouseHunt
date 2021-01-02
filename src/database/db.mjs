import { promisify } from 'util';
import pg from 'pg';
import Cursor from 'pg-cursor';
import { encodeHStore } from './hstore.mjs';

const DB_URL = process.env.DATABASE_URL || 'postgresql://localhost:5432/house_hunt';

export default class DB {
  constructor() {
    this.pool = new pg.Pool({ connectionString: DB_URL });
  }

  async connect() {
    await this.pool.query('CREATE EXTENSION IF NOT EXISTS hstore');
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS providers (
        id SERIAL PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        import_progress TEXT NOT NULL DEFAULT ''
      )
    `);
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS properties (
        id BIGSERIAL PRIMARY KEY,
        provider_id INTEGER NOT NULL REFERENCES providers (id) ON UPDATE CASCADE ON DELETE RESTRICT,
        external_id TEXT NOT NULL,
        loaded TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc'),
        updated TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc'),
        raw TEXT NOT NULL,
        filter_name TEXT NOT NULL,
        dirty BOOLEAN NOT NULL DEFAULT TRUE,
        listed TIMESTAMP WITHOUT TIME ZONE NULL DEFAULT NULL,
        type TEXT NULL DEFAULT NULL,
        price DOUBLE PRECISION NULL DEFAULT NULL,
        newbuild BOOLEAN NULL DEFAULT NULL,
        beds SMALLINT NULL DEFAULT NULL,
        latitude DOUBLE PRECISION NULL DEFAULT NULL,
        longitude DOUBLE PRECISION NULL DEFAULT NULL,
        extracted HSTORE NOT NULL,
        thumbnail TEXT NULL DEFAULT NULL,
        image TEXT NULL DEFAULT NULL,
        url TEXT NULL DEFAULT NULL,
        UNIQUE (provider_id, external_id)
      )
    `);
    await this.pool.query('CREATE INDEX IF NOT EXISTS properties_price ON properties (price)');
    await this.pool.query('CREATE INDEX IF NOT EXISTS properties_beds ON properties (beds, price)');
    await this.pool.query('CREATE INDEX IF NOT EXISTS properties_lat ON properties (latitude)');
    await this.pool.query('CREATE INDEX IF NOT EXISTS properties_lon ON properties (longitude)');
    await this.pool.query('CREATE INDEX IF NOT EXISTS properties_type ON properties (type)');
  }

  async getProviderState(providerName) {
    let providerData = await this.pool.query({
      rowMode: 'array',
      text: 'SELECT id, import_progress FROM providers WHERE name=$1',
      values: [providerName],
    });
    if (!providerData.rows.length) {
      providerData = await this.pool.query({
        rowMode: 'array',
        text: 'INSERT INTO providers (name) VALUES ($1) RETURNING id, import_progress',
        values: [providerName],
      });
    }
    return {
      id: providerData.rows[0][0],
      importProgress: providerData.rows[0][1],
    };
  }

  async setProviderImportProgress(providerId, progress) {
    await this.pool.query({
      text: 'UPDATE providers SET import_progress=$2 WHERE id=$1',
      values: [providerId, progress],
    });
  }

  async has(providerId, externalId) {
    const matchData = await this.pool.query({
      name: 'provider_externalid_exists',
      rowMode: 'array',
      text: 'SELECT 1 FROM properties WHERE provider_id=$1 AND external_id=$2',
      values: [providerId, externalId],
    });
    return matchData.rows.length > 0;
  }

  async add(providerId, externalId, raw, filterName) {
    const now = new Date().toUTCString();
    await this.pool.query({
      name: 'provider_externalid_add',
      text: `
        INSERT INTO properties (provider_id, external_id, loaded, updated, raw, filter_name, dirty, extracted)
        VALUES ($1, $2, $3, $3, $4, $5, TRUE, ''::HSTORE)
        ON CONFLICT (provider_id, external_id)
        DO UPDATE SET updated=$3, raw=$4, filter_name=$5, dirty=TRUE
      `,
      values: [providerId, externalId, now, raw, filterName],
    });
  }

  async getDirtyBatch(providerId, batchSize) {
    const batch = await this.pool.query({
      name: 'dirty_batch',
      rowMode: 'array',
      text: 'SELECT id, raw, filter_name FROM properties WHERE provider_id=$1 AND dirty LIMIT $2',
      values: [providerId, batchSize],
    });
    return batch.rows.map((row) => ({
      id: row[0],
      raw: row[1],
      filterName: row[2],
    }));
  }

  async *getAllLocations() {
    const client = await this.pool.connect();
    try {
      const cursor = client.query(new Cursor(
        'SELECT id, latitude, longitude FROM properties WHERE NOT dirty',
        [],
        { rowMode: 'array' },
      ));
      const cread = promisify(cursor.read.bind(cursor));
      try {
        while (true) {
          const batch = await cread(100);
          if (!batch.length) {
            break;
          }
          for (const item of batch) {
            yield { id: item[0], lat: item[1], lon: item[2] };
          }
        }
      } finally {
        await promisify(cursor.close.bind(cursor))();
      }
    } finally {
      client.release();
    }
  }

  async recordProcessed(itemId, { listed, type, price, newbuild, beds, latitude, longitude, extracted, thumbnail, image, url }) {
    await this.pool.query({
      name: 'record_processed',
      text: `
        UPDATE properties SET
          dirty=false,
          listed=$2,
          type=$3,
          price=$4,
          newbuild=$5,
          beds=$6,
          latitude=$7,
          longitude=$8,
          extracted=$9::hstore,
          thumbnail=$10,
          image=$11,
          url=$12
        WHERE id=$1
      `,
      values: [
        itemId,
        listed?.toUTCString(),
        type,
        price,
        newbuild,
        beds,
        latitude,
        longitude,
        encodeHStore(extracted),
        thumbnail,
        image,
        url,
      ],
    });
  }

  close() {
    this.pool.end();
  }
}
