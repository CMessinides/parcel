// @flow strict-local

import type {
  Bundle,
  LogEvent,
  ParcelOptions,
  ProgressLogEvent
} from '@parcel/types';

import {Color} from 'ink';
import React from 'react';
import {Log, Progress} from './Log';
import BundleReport from './BundleReport';

type Props = {|
  bundles: ?Array<Bundle>,
  logs: Array<LogEvent>,
  options: ParcelOptions,
  progress: ?ProgressLogEvent
|};

export default function UI({logs, progress, bundles, options}: Props) {
  return (
    <Color reset>
      <div>
        {logs.map((log, i) => (
          <Log key={i} event={log} />
        ))}
        {progress ? <Progress event={progress} /> : null}
        {options.mode === 'production' && bundles ? (
          <BundleReport bundles={bundles} />
        ) : null}
      </div>
    </Color>
  );
}
