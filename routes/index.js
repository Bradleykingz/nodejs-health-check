const express = require('express');
const router = express.Router();

const dotenv = require('dotenv');
const {Pool} = require('pg');

const pool = new Pool()
dotenv.config();

const analyzeDatabaseHealth = async function () {

  let status = "up"
  let name = "database";

  try {
    const {rows: stats} = await pool.query(`
      SELECT (total_time / 1000 / 60) as total_time,
             (total_time / calls)     as avg_time,
             query
      FROM pg_stat_statements
      ORDER BY 2 DESC
      LIMIT 1;
    `)

    if (!stats) return {
      status,
      name,
      condition: {
        health: "unhealthy",
        cause: "no stats"
      }
    };


    return {
      status,
      name,
      condition: {
        health: "healthy"
      }
    }
  }catch (e) {
    status = 'down';
    return {
      status,
      name,
      condition: {
        health: "unhealthy",
        cause: "unable to execute queries"
      }
    }
  }
};

async function analyzeRedis() {
  return {
    name: 'redis',
    status: "up",
    condition: {
      health: "healthy"
    }
  }
}

async function  analyzeThirdPartyConnection() {
  return {
    name: 'third-party',
    status: "up",
    condition: {
      health: "healthy"
    }
  }
}

router.get("/health", async function (req, res) {

  let status = "up";
  let cause = ""

  const health = {
    // aggregate status
    status: "up",
    services: []
  };

  const coreMetrics = [
    analyzeDatabaseHealth, // method analyzing database health
    analyzeRedis, // method analyzing redis
    analyzeThirdPartyConnection, // method analyzing third-party
  ];

  for (let i = 0; i < coreMetrics.length; i++){
    // run every function in turn. Note that each is async.
    let func = coreMetrics[i];
    const metricResult = await func();
    // if any core metric is down
    // set the api as being down, since some requests won’t be processed.
    if (metricResult.status === "down") {
      status = "down";
      cause = `dependent service '${metricResult.name}' is down`;
    }

    // add this to the 'services' array
    health.services.push(metricResult);
  }

  // if status is not ‘up’, we set it to ‘down’ and state a cause.
  if (status !== "up") {
    health.status = status;
    health.cause = cause;
  }

  // return the api health.
  return res.send(health);
});

module.exports = router;
