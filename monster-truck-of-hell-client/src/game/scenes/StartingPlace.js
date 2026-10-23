// The starting place: the hellish sky and lava sea, the spawn plaza with its props, and the race
// course leading off its north edge.

import { createEnvironment } from '../entities/Environment.js';
import { buildCourse } from '../entities/Course.js';
import { buildSpawnProps } from '../entities/SpawnProps.js';

export function buildStartingPlace(scene, physics, renderer, quality = 'High') {
  const env = createEnvironment(scene, renderer, quality);
  const course = buildCourse(scene, physics);
  const props = buildSpawnProps(scene, physics);

  return {
    parts: { course, wheel: props.wheel, pads: props.pads, shows: props.shows },
    update(dt, time, camera, focus) {
      env.update(dt, time, camera, focus);
      course.update(dt, time);
      props.update(dt, time);
    },
  };
}
