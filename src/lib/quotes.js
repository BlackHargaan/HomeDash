// Built-in quotes for the Quote of the Day widget: short, well-known lines from
// historical figures (public domain).
export const QUOTES = [
  ['The secret of getting ahead is getting started.', 'Mark Twain'],
  ['Well done is better than well said.', 'Benjamin Franklin'],
  ['It always seems impossible until it’s done.', 'Nelson Mandela'],
  ['Simplicity is the ultimate sophistication.', 'Leonardo da Vinci'],
  ['The journey of a thousand miles begins with one step.', 'Lao Tzu'],
  ['We are what we repeatedly do. Excellence, then, is not an act, but a habit.', 'Will Durant, on Aristotle'],
  ['Do what you can, with what you have, where you are.', 'Theodore Roosevelt'],
  ['Lost time is never found again.', 'Benjamin Franklin'],
  ['Action is the foundational key to all success.', 'Pablo Picasso'],
  ['Knowing is not enough; we must apply. Willing is not enough; we must do.', 'Johann Wolfgang von Goethe'],
  ['It does not matter how slowly you go as long as you do not stop.', 'Confucius'],
  ['The best way out is always through.', 'Robert Frost'],
  ['Energy and persistence conquer all things.', 'Benjamin Franklin'],
  ['Begin at once to live.', 'Seneca'],
  ['He who has a why to live can bear almost any how.', 'Friedrich Nietzsche'],
  ['Little by little, one travels far.', 'J. R. R. Tolkien'],
  ['You must be the change you wish to see in the world.', 'attributed to Mahatma Gandhi'],
  ['Genius is one percent inspiration and ninety-nine percent perspiration.', 'Thomas Edison'],
  ['Whether you think you can or you think you can’t, you’re right.', 'Henry Ford'],
  ['Discipline is choosing between what you want now and what you want most.', 'Abraham Lincoln (attributed)'],
  ['Waste no more time arguing what a good man should be. Be one.', 'Marcus Aurelius'],
  ['The impediment to action advances action. What stands in the way becomes the way.', 'Marcus Aurelius'],
  ['Luck is what happens when preparation meets opportunity.', 'Seneca'],
  ['If you want to go fast, go alone. If you want to go far, go together.', 'African proverb'],
  ['A goal without a plan is just a wish.', 'Antoine de Saint-Exupéry'],
  ['Plans are worthless, but planning is everything.', 'Dwight D. Eisenhower'],
  ['What is important is seldom urgent and what is urgent is seldom important.', 'Dwight D. Eisenhower'],
  ['Quality is not an act, it is a habit.', 'Aristotle'],
  ['Courage is grace under pressure.', 'Ernest Hemingway'],
  ['In the middle of difficulty lies opportunity.', 'Albert Einstein'],
  ['Life is like riding a bicycle. To keep your balance you must keep moving.', 'Albert Einstein'],
  ['Imagination is more important than knowledge.', 'Albert Einstein'],
  ['The future depends on what you do today.', 'Mahatma Gandhi'],
  ['Be kind, for everyone you meet is fighting a hard battle.', 'Ian Maclaren'],
  ['Fall seven times, stand up eight.', 'Japanese proverb'],
  ['Well begun is half done.', 'Aristotle'],
  ['Either write something worth reading or do something worth writing.', 'Benjamin Franklin'],
  ['Happiness depends upon ourselves.', 'Aristotle'],
  ['The mind is everything. What you think you become.', 'attributed to Buddha'],
  ['Act as if what you do makes a difference. It does.', 'William James'],
  ['Opportunities multiply as they are seized.', 'Sun Tzu'],
  ['Great things are done by a series of small things brought together.', 'Vincent van Gogh'],
  ['I have not failed. I’ve just found 10,000 ways that won’t work.', 'Thomas Edison'],
  ['If it is not right, do not do it; if it is not true, do not say it.', 'Marcus Aurelius'],
  ['To be prepared is half the victory.', 'Miguel de Cervantes'],
  ['There is no substitute for hard work.', 'Thomas Edison'],
  ['The best time to plant a tree was 20 years ago. The second best time is now.', 'Chinese proverb'],
  ['Order and simplification are the first steps toward the mastery of a subject.', 'Thomas Mann'],
  ['Time is what we want most, but what we use worst.', 'William Penn'],
].map(([text, author]) => ({ text, author }))

// Same quote all day, a different one tomorrow; stable across reloads.
export function dayIndex(date = new Date()) {
  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000)
}

export function quoteForDay(list, date = new Date(), offset = 0) {
  if (!list.length) return null
  const n = list.length
  // Multiplying by a prime coprime to typical list sizes spreads consecutive
  // days across the list instead of walking it in order.
  const i = (((dayIndex(date) + offset) * 7919) % n + n) % n
  return list[i]
}
