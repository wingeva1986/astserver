let express = require('express');
let Queue = require('bull');

const { createBullBoard } = require('@bull-board/api');
const { BullAdapter } = require('@bull-board/api/bullAdapter');
const { ExpressAdapter } = require('@bull-board/express');

const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/admin/queues');

// Serve on PORT on Heroku and on localhost:5000 locally
let PORT = process.env.PORT  || '8080';
// Connect to a local redis intance locally, and the Heroku-provided URL in production
let REDIS_URL = process.env.REDIS_URL  ||'redis://127.0.0.1:6379';

let app = express();
app.use(express.json({limit:'10mb'}));



// Create / Connect to a named work queue
let workQueue = new Queue('work', REDIS_URL,{settings:{lockDuration:100000,maxStalledCount:0}});




const { addQueue, removeQueue, setQueues, replaceQueues } = createBullBoard({
  queues: [new BullAdapter(workQueue)],
  serverAdapter: serverAdapter,
});

app.use('/admin/queues', serverAdapter.getRouter());
//var results={};

// Serve the two static assets
app.get('/', (req, res) => res.send('nothing'));
app.get('/ping', (req, res) => res.send('pong'));
app.get('/client.js', (req, res) => res.sendFile('client.js', { root: __dirname }));

// Kick off a new job by adding it to the work queue
app.post('/job', async (req, res) => {
  // This would be where you could pass arguments to the job
  // Ex: workQueue.add({ url: 'https://www.heroku.com' })
  // Docs: https://github.com/OptimalBits/bull/blob/develop/REFERENCE.md#queueadd
  let job = await workQueue.add(req.body);
  res.json({ id: job.id });
});

// Allows the client to query the state of a background job
app.get('/job/:id', async (req, res) => {
  let id = req.params.id;
  let job = await workQueue.getJob(id);

  if (job === null) {
    res.status(404).end();
  } else {
    let state = await job.getState();
    let progress = job._progress;
    let reason = job.failedReason;
    let result = state=='completed'?job.data.code:undefined;
    res.json({ id, state, progress, reason, result });
  }
});

// You can listen to global events to get notified when jobs are processed
workQueue.on('global:completed', (jobId, result) => {
  //console.log(`Job completed with result ${result}`);
  //results[jobId]=JSON.parse(result).value;

});


// Message cleaning
workQueue.on('cleaned', function(jobs, type) {
  console.log('Cleaned %s %s jobs', jobs.length, type);
  //for(job of jobs)
    //results[job.id]='';
});

// Clear queue every minute of processed and failed jobs.
setInterval(function() {
  // Cleans all jobs that completed over 60 seconds ago,
  // and cleans all jobs that failed over 2 minutes ago.
  workQueue.clean(100000);
  workQueue.clean(120000, 'failed');
}, 60000);

app.listen(PORT, () => console.log("Server started!"));
