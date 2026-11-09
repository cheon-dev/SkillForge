import type { SelfPacedCourse } from '../data/selfPacedCourses';

export interface SelfPacedCourseProgress {
  completedLessons: number;
  totalLessons: number;
  percentComplete: number;
  nextLessonId: string | null;
}

export const getSelfPacedCourseProgress = (
  course: SelfPacedCourse,
  completedLessonIds: ReadonlySet<string>,
): SelfPacedCourseProgress => {
  const completedLessons = course.lessons.filter((lesson) => completedLessonIds.has(lesson.id)).length;
  const totalLessons = course.lessons.length;

  return {
    completedLessons,
    totalLessons,
    percentComplete: totalLessons === 0 ? 0 : Math.round((completedLessons / totalLessons) * 100),
    nextLessonId: course.lessons.find((lesson) => !completedLessonIds.has(lesson.id))?.id ?? null,
  };
};
