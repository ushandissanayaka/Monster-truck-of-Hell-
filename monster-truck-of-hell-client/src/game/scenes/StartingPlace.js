// The starting place: the hellish sky and lava sea, the spawn plaza with its props, and the race
// course leading off its north edge. The course changes every race (see setCourseVariant), so it can
// be taken out and built again.

import { createEnvironment } from '../entities/Environment.js';
import { buildCourse } from '../entities/Course.js';
import { buildSpawnProps } from '../entities/SpawnProps.js';

export function buildStartingPlace(scene, physics, renderer, quality = 'High') {
  const env = createEnvironment(scene, renderer, quality);
  const parts = {};
  let courseBodies = null;
  const makeCourse = () => { courseBodies = physics.record(() => { parts.course = buildCourse(scene, physics); }); };
  makeCourse();
  const props = buildSpawnProps(scene, physics);
  Object.assign(parts, { wheel: props.wheel, pads: props.pads, shows: props.shows });

  return {
    parts,
    // a new race, a new course: the old one out (looks and physics), the current COURSE in
    rebuildCourse() {
      parts.course.dispose();
      physics.remove(courseBodies);
      makeCourse();
      env.rebuildPit();
    },
    update(dt, time, camera, focus) {
      env.update(dt, time, camera, focus);
      parts.course.update(dt, time);
      props.update(dt, time);
    },
  };
}
