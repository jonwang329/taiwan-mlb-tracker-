import {runSchedulingRegression} from './eddie-scheduling-core.mjs';

const result=runSchedulingRegression();
console.log(JSON.stringify(result));
if(!result.ok) process.exit(1);
