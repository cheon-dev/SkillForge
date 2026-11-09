import { describe, expect, it } from 'vitest';
import { selfPacedCourses, type SelfPacedCourse } from '../data/selfPacedCourses';
import { getSelfPacedCourseProgress } from './selfPaced';

const course: SelfPacedCourse = {
  skill: 'Example',
  title: 'Example course',
  description: 'A test course.',
  lessons: [
    { id: 'one', title: 'One', minutes: 5, learn: [], example: '', practice: '', question: '', options: [], answer: 0, explanation: '' },
    { id: 'two', title: 'Two', minutes: 5, learn: [], example: '', practice: '', question: '', options: [], answer: 0, explanation: '' },
  ],
};

describe('getSelfPacedCourseProgress', () => {
  it('finds the next lesson and calculates progress', () => {
    expect(getSelfPacedCourseProgress(course, new Set(['one']))).toEqual({
      completedLessons: 1,
      totalLessons: 2,
      percentComplete: 50,
      nextLessonId: 'two',
    });
  });

  it('returns no next lesson when every lesson is complete', () => {
    expect(getSelfPacedCourseProgress(course, new Set(['one', 'two'])).nextLessonId).toBeNull();
  });

  it('keeps every authored lesson identifiable and its quiz answer valid', () => {
    const lessonIds = selfPacedCourses.flatMap((item) => item.lessons.map((lesson) => lesson.id));

    expect(selfPacedCourses).toHaveLength(16);
    expect(new Set(lessonIds).size).toBe(lessonIds.length);
    for (const item of selfPacedCourses) {
      expect(item.lessons).toHaveLength(2);
      for (const lesson of item.lessons) {
        expect(lesson.options.length).toBeGreaterThan(1);
        expect(lesson.answer).toBeGreaterThanOrEqual(0);
        expect(lesson.answer).toBeLessThan(lesson.options.length);
        expect(lesson.learn.length).toBeGreaterThan(0);
      }
    }
  });
});
