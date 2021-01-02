# House Hunt

Loads data from property APIs (currently Zoopla) and provides enhanced filtering options.

Requires a PostgreSQL database to connect to:

```sh
psql postgres -c 'CREATE DATABASE house_hunt;'
```

And a Zoopla API key (see <https://developer.zoopla.co.uk/home> to register).

For all the following commands, if you used an alternative database name
or a remote database, you can specify the connection string explicitly:

```sh
DB_URL=postgresql://localhost:5432/house_hunt whatever-command-here
```

## Loading data

This command will connect to the property API and load or refresh data:

```sh
ZOOPLA_KEY=my-key-here ./src/load/index.mjs
```

This may take several hours to complete due to API rate limits.
The process can be stopped and restarted at any time.

Once you have loaded new data, you should apply processing (this is much faster).

```sh
./src/process/index.mjs
```

## Running

Once you have loaded some data, you can start the application:

```sh
./src/start/index.mjs
```
