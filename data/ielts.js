/*
 * 雅思练习题库（原创题目，按雅思题型编写；正式备考请配合《剑桥雅思》真题）。
 * 只往数组末尾追加。
 */
window.IELTS = {
  // 口语 Part 1：[话题, [问题...]]
  P1: [
    ["Hometown", ["Where is your hometown?", "What do you like most about it?", "Has it changed much in recent years?", "Would you like to live there in the future?"]],
    ["Work or studies", ["Do you work, or are you a student?", "What do you like about your job or your studies?", "Is there anything you would like to change about it?", "What kind of job would you like to do in the future?"]],
    ["Accommodation", ["Do you live in a house or a flat?", "Which room do you spend the most time in?", "Who do you live with?", "Would you like to move somewhere else one day?"]],
    ["Weekends", ["What do you usually do at weekends?", "Do you prefer busy weekends or relaxing ones?", "What did you do last weekend?", "Do you ever have to work at weekends?"]],
    ["Food and cooking", ["Do you like cooking?", "What is a typical meal in your hometown?", "Do you prefer eating at home or eating out?", "Is there any food you really don't like?"]],
    ["Travel", ["Do you like travelling?", "Where did you go on your last trip?", "Do you prefer travelling alone or with other people?", "Which country would you most like to visit?"]],
    ["Weather", ["What is the weather usually like in your hometown?", "What is your favourite season, and why?", "Does the weather affect your mood?", "Do you check the weather forecast every day?"]],
    ["Mobile phones", ["How often do you use your phone?", "What do you mostly use it for?", "Do you think people spend too much time on their phones?", "Could you live without your phone for a week?"]],
    ["Music", ["What kind of music do you like?", "When do you usually listen to music?", "Did you learn to play an instrument as a child?", "Have you ever been to a live concert?"]],
    ["Sport and exercise", ["Do you play any sport?", "How do you keep fit?", "Did you do much sport at school?", "Is there a sport you would like to try?"]],
    ["Shopping", ["Do you enjoy shopping?", "Do you prefer shopping online or in shops?", "What was the last thing you bought?", "Have you ever regretted buying something?"]],
    ["Friends", ["Do you have many close friends?", "What do you usually do together?", "Is it easy to make new friends where you live?", "Do you still keep in touch with your school friends?"]],
    ["Reading", ["Do you like reading?", "What kind of things do you read?", "Do you prefer paper books or reading on a screen?", "Did you read a lot when you were a child?"]],
    ["Getting around", ["How do you usually get around your city?", "Is public transport good where you live?", "Do you like driving?", "How do you think transport will change in the future?"]],
    ["Learning English", ["How long have you been learning English?", "What is the most difficult part of English for you?", "How do you practise speaking?", "Why are you learning English?"]],
    ["Festivals", ["What is your favourite festival?", "How do you usually celebrate it?", "Has the way people celebrate it changed?", "Do you prefer traditional or modern celebrations?"]],
    ["Mornings", ["Are you a morning person?", "What do you usually do in the morning?", "Has your morning routine changed over the years?", "Do you eat breakfast every day?"]],
    ["Photos", ["Do you like taking photos?", "What do you usually take photos of?", "Do you prefer taking photos with a phone or a camera?", "Do you ever print your photos?"]]
  ],

  // 口语 Part 2 话题卡 + 对应 Part 3 问题
  P2: [
    { title: 'Describe a trip you really enjoyed.', bullets: ['where you went', 'who you went with', 'what you did there'], why: 'and explain why you enjoyed it so much.',
      p3: ['Why do people like travelling?', 'What are the advantages of travelling alone?', 'How has tourism changed in your country?'] },
    { title: 'Describe a skill you would like to learn.', bullets: ['what the skill is', 'why you want to learn it', 'how you would learn it'], why: 'and explain how it would help you.',
      p3: ['What skills are most useful for young people today?', 'Is it better to learn a skill from a teacher or by yourself?', 'Do schools teach enough practical skills?'] },
    { title: 'Describe a person who has helped you.', bullets: ['who the person is', 'how you know them', 'how they helped you'], why: 'and explain how you felt about it.',
      p3: ['Why do some people help strangers?', 'Should children be taught to help others?', 'Are people less helpful than they were in the past?'] },
    { title: 'Describe a job you would like to do in the future.', bullets: ['what the job is', 'what it involves', 'what skills you need for it'], why: 'and explain why you would like to do it.',
      p3: ['What makes a job satisfying?', 'Is salary the most important thing when choosing a job?', 'How will jobs change in the future?'] },
    { title: 'Describe a place in your city that you like to visit.', bullets: ['where it is', 'how often you go there', 'what you do there'], why: 'and explain why you like it.',
      p3: ['Why are parks and public spaces important in cities?', 'Would you rather live in a city or in the countryside?', 'How could cities be made better places to live?'] },
    { title: 'Describe a time when you had to wait for something.', bullets: ['what you were waiting for', 'how long you waited', 'what you did while you were waiting'], why: 'and explain how you felt about waiting.',
      p3: ['Are people less patient than they used to be?', 'Has technology made people more impatient?', 'In what situations is it important to be patient?'] },
    { title: 'Describe a piece of technology you use every day.', bullets: ['what it is', 'when you started using it', 'what you use it for'], why: 'and explain how your life would be different without it.',
      p3: ['Do older people find it harder to use new technology?', 'Has technology improved the way people communicate?', 'What technology do you think will be important in the future?'] },
    { title: 'Describe a memorable meal you had.', bullets: ['where you had it', 'who you were with', 'what you ate'], why: 'and explain why it was memorable.',
      p3: ['Why do people like eating out?', 'How have eating habits changed in your country?', 'Should children learn to cook at school?'] },
    { title: 'Describe a difficult decision you made.', bullets: ['what the decision was', 'when you made it', 'how you made it'], why: 'and explain why it was difficult.',
      p3: ['Do young people make decisions differently from older people?', 'Is it good to ask others for advice before deciding?', 'What important decisions do people make in their twenties?'] },
    { title: 'Describe a film or TV series you enjoyed.', bullets: ['what it was', 'when you watched it', 'what it was about'], why: 'and explain why you enjoyed it.',
      p3: ['Why do people enjoy watching films?', 'Is it better to watch films at home or at the cinema?', 'Can films help people learn a language?'] },
    { title: 'Describe something new you learned outside school.', bullets: ['what you learned', 'where and how you learned it', 'how long it took'], why: 'and explain how useful it has been.',
      p3: ['Is learning outside school as important as learning at school?', 'How do adults usually learn new things?', 'Will online learning replace traditional classes?'] },
    { title: 'Describe a goal you want to achieve.', bullets: ['what the goal is', 'when you set it', 'what you are doing to achieve it'], why: 'and explain why it is important to you.',
      p3: ['Why do some people find it hard to achieve their goals?', 'Should people set long-term or short-term goals?', 'Do young people today have different goals from their parents?'] },
    { title: 'Describe a time you met someone from another country.', bullets: ['who the person was', 'where you met', 'what you talked about'], why: 'and explain what you learned from meeting them.',
      p3: ['What are the benefits of meeting people from other cultures?', 'What problems can people have when they live abroad?', 'Is it important to learn about other cultures at school?'] },
    { title: 'Describe a hobby you enjoy.', bullets: ['what the hobby is', 'when you started it', 'how often you do it'], why: 'and explain why you enjoy it.',
      p3: ['Why is it important for people to have hobbies?', 'Do people have less free time than before?', 'Should hobbies be relaxing or challenging?'] },
    { title: 'Describe a time when you were very busy.', bullets: ['when it was', 'what you had to do', 'how you managed your time'], why: 'and explain how you felt about being so busy.',
      p3: ['Why are people busier these days?', 'How can people manage their time better?', 'Is it good for young people to work while they study?'] },
    { title: 'Describe an outdoor activity you did.', bullets: ['what the activity was', 'where you did it', 'who you did it with'], why: 'and explain how you felt about it.',
      p3: ['Why do people enjoy outdoor activities?', 'Do children spend enough time outdoors these days?', 'How can cities encourage people to be more active?'] }
  ],

  // G 类小作文（书信）：{ to: 开头称呼, prompt: 情境, bullets }
  W1: [
    { prompt: 'You recently stayed at a hostel and left something behind in your room.', to: 'Dear Sir or Madam,', bullets: ['describe the item you left behind', 'explain where you think you left it', 'say how you would like it to be returned to you'] },
    { prompt: 'You need to take a few days off work next month.', to: 'Dear Ms Taylor,', bullets: ['explain why you need the time off', 'say which days you would like to take', 'suggest how your work could be covered'] },
    { prompt: 'The heater in the flat you are renting has stopped working.', to: 'Dear Mr Wilson,', bullets: ['describe the problem', 'explain how it is affecting you', 'say what you would like the landlord to do'] },
    { prompt: 'A friend let you stay at their home while you were travelling.', to: 'Dear Sam,', bullets: ['thank them for their help', 'describe what you enjoyed most during your stay', 'invite them to visit you'] },
    { prompt: 'You are applying for a new job and need a reference from a previous manager.', to: 'Dear Mr Lee,', bullets: ['remind them who you are', 'explain what job you are applying for', 'ask them to write a reference for you'] },
    { prompt: 'A tour you booked was cancelled at the last minute and you have not received your money back.', to: 'Dear Sir or Madam,', bullets: ['give details of the tour you booked', 'explain what happened', 'say what you want the company to do'] },
    { prompt: 'Your neighbours have been making a lot of noise late at night.', to: 'Dear neighbours,', bullets: ['describe the noise', 'explain how it is affecting you', 'suggest a solution'] },
    { prompt: 'You want to join an evening English course at a local college.', to: 'Dear Sir or Madam,', bullets: ['explain why you want to take the course', 'ask about the times and the cost', 'ask about anything else you need to know'] },
    { prompt: 'You lost a bag on a bus last week.', to: 'Dear Sir or Madam,', bullets: ['say when and where you lost it', 'describe the bag and what was in it', 'explain how they can contact you'] },
    { prompt: 'You have been offered a job, but you cannot start on the date the employer suggested.', to: 'Dear Ms Brown,', bullets: ['thank them for the offer', 'explain why you cannot start on that date', 'suggest another start date'] },
    { prompt: 'The park near your home has become dirty and unsafe.', to: 'Dear Sir or Madam,', bullets: ['describe the problems in the park', 'explain why the park is important to local people', 'suggest what the council should do'] },
    { prompt: 'An English-speaking friend is planning to visit your country for the first time.', to: 'Dear Alex,', bullets: ['suggest the best time of year to visit', 'recommend some places to go', 'give some advice about travelling there'] }
  ],

  // G 类大作文
  W2: [
    'Some people think young people should travel or work abroad before they start their careers. To what extent do you agree or disagree?',
    'In many countries, people are working longer hours than before. What are the causes of this, and what can be done about it?',
    'Some people prefer to live in a big city, while others prefer the countryside. Discuss both views and give your own opinion.',
    'Online shopping is replacing traditional shopping. Do the advantages of this outweigh the disadvantages?',
    'Many people use their phones while they are spending time with family and friends. Why does this happen? Is it a positive or negative development?',
    'Some people believe that children should learn practical skills such as cooking and managing money at school. To what extent do you agree or disagree?',
    'Tourism brings money to an area, but it can also cause problems. Do the advantages of tourism outweigh the disadvantages?',
    'More and more people are choosing to work from home. What are the advantages and disadvantages of this trend?',
    'Some people say learning a foreign language is no longer necessary because of translation technology. Others disagree. Discuss both views and give your opinion.',
    'Fast food is becoming more popular in many countries. Why is this happening, and what effects does it have?',
    'Some people think employers should give their workers more holidays. To what extent do you agree or disagree?',
    'Some people believe public transport should be free for everyone. To what extent do you agree or disagree?'
  ],

  // 原始分（满分 40）→ 分数换算（官方公布的大致对照，不同套题会略有浮动）
  BANDS: {
    listening: [[39, 9], [37, 8.5], [35, 8], [32, 7.5], [30, 7], [26, 6.5], [23, 6], [18, 5.5], [16, 5], [13, 4.5], [10, 4], [8, 3.5], [6, 3], [4, 2.5]],
    readingGT: [[40, 9], [39, 8.5], [37, 8], [36, 7.5], [34, 7], [32, 6.5], [30, 6], [27, 5.5], [23, 5], [19, 4.5], [15, 4], [12, 3.5], [9, 3], [6, 2.5]]
  }
};
