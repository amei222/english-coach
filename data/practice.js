/*
 * 练习内容。只往数组末尾追加（进度按序号记录）。
 *
 * LISTEN:    [要写下来的句子, 分类, 朗读用的文字（可选：拼写字母、读电话号码时用）]
 * SCENARIOS: AI 陪练场景
 * QUOTES:    [英文, 中文]
 */

window.LISTEN = [
  // ---- 📝 雅思听力 Section 1 常考：拼写、数字、日期、地址 ----
  ["My surname is Whitfield.", "ielts", "My surname is Whitfield. That's W, H, I, T, F, I, E, L, D."],
  ["The booking is for the 23rd of March.", "ielts"],
  ["The rent is $185 a week.", "ielts"],
  ["The phone number is 021 384 5567.", "ielts", "The phone number is oh two one, three eight four, double five six seven."],
  ["The address is 42 Harbour Street.", "ielts", "The address is forty-two Harbour Street. Harbour is H, A, R, B, O, U, R."],
  ["The postcode is 3145.", "ielts", "The postcode is three one four five."],
  ["The course starts at half past nine.", "ielts"],
  ["The tour costs $75, including lunch.", "ielts"],
  ["Her email address is mia.chen@gmail.com.", "ielts", "Her email address is mia dot chen at gmail dot com."],
  ["You need to bring your passport and two photos.", "ielts"],
  ["The meeting point is outside the library.", "ielts"],
  ["The flight number is NZ 289.", "ielts", "The flight number is N Z two eight nine."],
  ["Parking costs $4.50 per hour.", "ielts"],
  ["The museum is closed on Mondays.", "ielts"],
  ["We'll need a deposit of $200.", "ielts"],
  ["The class is on the second floor, in room 214.", "ielts", "The class is on the second floor, in room two one four."],
  ["My date of birth is the 5th of July, 1998.", "ielts"],
  ["Please arrive fifteen minutes before the start.", "ielts"],
  ["The bus leaves every twenty minutes.", "ielts"],
  ["You can pay by cash or credit card.", "ielts"],
  ["The hostel is next to the post office.", "ielts"],
  ["My first name is Jian.", "ielts", "My first name is Jian. That's J, I, A, N."],
  ["I live on Kingsley Road.", "ielts", "I live on Kingsley Road. Kingsley is K, I, N, G, S, L, E, Y."],
  ["The main advantage of this method is that it is cheap.", "ielts"],
  ["There are three factors we need to consider.", "ielts"],
  ["The number of visitors has doubled over the past ten years.", "ielts"],
  ["First, let's look at the history of the town.", "ielts"],

  // ---- 🧳 旅行生活 ----
  ["Could you tell me where the nearest bus stop is?", "travel"],
  ["I'd like a return ticket to Christchurch, please.", "travel"],
  ["Is breakfast included in the price?", "travel"],
  ["Sorry, we're fully booked tonight, but we have a room tomorrow.", "travel"],
  ["The rent is $220 a week, and bills are included.", "travel"],
  ["You'll need to pay four weeks' bond before you move in.", "travel"],
  ["How long are you planning to stay in the country?", "travel"],
  ["Can you show me your return ticket or proof of funds?", "travel"],
  ["I've had a headache and a sore throat since yesterday.", "travel"],
  ["Do you have anything to declare, such as food or plants?", "travel"],
  ["The next train to the airport leaves in ten minutes.", "travel"],
  ["Could we get the bill, please? We're paying separately.", "travel"],

  // ---- 💼 打工求职 ----
  ["Hi, I'm calling about the job ad. Is the position still open?", "job"],
  ["Can you come in for a trial shift on Thursday morning?", "job"],
  ["We pay $25 an hour, and you'll get paid weekly.", "job"],
  ["Please make sure you wear your safety boots on site.", "job"],
  ["The new roster comes out every Sunday night.", "job"],
  ["I'm available to start straight away, and I can work weekends.", "job"],
  ["Could you show me how the coffee machine works again?", "job"],
  ["You're paid by the bin, so the faster you pick, the more you earn.", "job"],
  ["I need to call in sick today, I've got a fever.", "job"],
  ["There's a mistake on my payslip, I think some hours are missing.", "job"],
  ["Hi there, what can I get for you today?", "job"],

  // ---- 💬 日常 ----
  ["No worries, mate, see you this arvo.", "daily"],
  ["What have you been up to since you arrived?", "daily"],
  ["I'm thinking about heading down south next month.", "daily"],
  ["It was a long hike, but the view was totally worth it.", "daily"],
  ["Could you speak a little slower? I'm still learning.", "daily"],
  ["I've just arrived, so I'm still finding my way around.", "daily"],
  ["Cheers for the help, I really appreciate it.", "daily"]
];

window.SCENARIOS = [
  // ---- 🧳 旅行生活 ----
  { id: 'border', tag: 'travel', title: '入境：边境官问话', zh: '你刚落地奥克兰，边境官在检查你的打工度假签证。',
    persona: 'A New Zealand border officer at Auckland Airport checking a working holiday visa holder. Professional and polite but direct. Asks about the purpose of the visit, length of stay, where they will stay, funds, job plans, and food or items to declare — one question at a time.',
    goal: '清楚回答：来干什么、待多久、住哪里、有多少钱、带了什么。',
    opener: "Good morning. Passport, please. What's the purpose of your visit?" },
  { id: 'hostel', tag: 'travel', title: '青旅入住', zh: '你到了皇后镇的青旅前台办入住。',
    persona: 'A friendly hostel receptionist in Queenstown. Explains check-in, house rules, kitchen and laundry, and gives local tips (hikes, cheap food, bus to town).',
    goal: '办入住、问清楚设施和规定、打听本地好玩便宜的地方。',
    opener: "Hi, welcome! Checking in?" },
  { id: 'flat', tag: 'travel', title: '租房看房', zh: '你在墨尔本看一个合租房间。',
    persona: 'Emma, a landlord showing a room in a shared house in Melbourne. Rent is $230 a week, bills are extra, bond is four weeks, she wants someone for at least six months, and she asks about the tenant\'s job and habits.',
    goal: '问清楚房租、押金、杂费、室友、租期，并介绍自己。',
    opener: "Hi, you must be here about the room. Come on in! Have you been looking for long?" },
  { id: 'bank', tag: 'travel', title: '开银行账户', zh: '你在悉尼的银行开户。',
    persona: 'A helpful bank staff member in Sydney opening an account for a new working holiday maker. Asks for passport, address and tax number, and explains the debit card, fees and how to receive pay.',
    goal: '开户，问清楚手续费、银行卡什么时候到、怎么往国内转账。',
    opener: "Hi there, how can I help you today?" },
  { id: 'doctor', tag: 'travel', title: '去诊所看病', zh: '你感冒好几天了，去克赖斯特彻奇的一家诊所。',
    persona: 'A GP (family doctor) at a walk-in clinic in Christchurch. Asks about symptoms, how long, allergies and current medication, then gives simple advice.',
    goal: '描述症状、回答医生的问题、问清楚怎么吃药和要多少钱。',
    opener: "Hi, come in and take a seat. What seems to be the problem today?" },
  { id: 'campervan', tag: 'travel', title: '租房车自驾', zh: '你要租一辆房车环游南岛。',
    persona: 'A campervan rental agent. Explains insurance options, driving on the left, fuel, where you can and can\'t park overnight, and pick-up and drop-off times.',
    goal: '租车、比较保险、问清交通规则、确认取还车时间。',
    opener: "Hi! Picking up a campervan today?" },

  // ---- 💼 打工求职 ----
  { id: 'cafe-interview', tag: 'job', title: '咖啡馆面试', zh: '惠灵顿一家很忙的咖啡馆在招临时工，老板面试你。',
    persona: 'Sam, the owner of a busy café in Wellington, interviewing for a casual all-rounder (coffee, tables, dishes). Asks about experience, availability, why New Zealand, and how the learner handles busy times or a difficult customer.',
    goal: '介绍经验和能上班的时间，问清楚时薪和班次。',
    opener: "Thanks for coming in. So, tell me a bit about yourself." },
  { id: 'call-job', tag: 'job', title: '打电话问摘果工作', zh: '你在网上看到果园招工，打电话过去问。',
    persona: 'Karen, a farm manager answering the phone about a fruit picking job ad. Asks about the learner\'s visa, start date, transport and experience; explains pay by the bin and the accommodation on the farm.',
    goal: '说明来意，问清楚工资怎么算、包不包住、什么时候开始。',
    opener: "Hello, Riverside Orchard, Karen speaking." },
  { id: 'first-day', tag: 'job', title: '果园上工第一天', zh: '主管在给你这个新来的摘果工讲规矩。',
    persona: 'Mike, an orchard supervisor showing a new picker the ropes: safety, how to pick without damaging fruit, breaks, bins and pay. Talks fast and uses Kiwi slang, but explains again if asked.',
    goal: '听懂指令，没听懂就追问确认。',
    opener: "Morning! You must be the new picker. Ready to get stuck in?" },
  { id: 'shift', tag: 'job', title: '跟经理请假调班', zh: '你下周五需要请假，想和同事换班。',
    persona: 'Lisa, a busy but fair restaurant manager. The learner needs next Friday off and wants to swap a shift.',
    goal: '礼貌地请假或调班，说明理由，提出解决办法。',
    opener: "Hey, you wanted to talk to me? I've only got a few minutes." },
  { id: 'pay', tag: 'job', title: '工资少算了', zh: '你的工资单少算了 6 个小时，去找老板。',
    persona: 'Tom, a café owner. The learner\'s payslip is missing six hours. Tom is friendly but a bit defensive at first, and fixes it if the learner explains clearly.',
    goal: '礼貌但坚定地说明问题、拿出依据、谈好怎么补发。',
    opener: "Hi! What's up?" },
  { id: 'coworker', tag: 'job', title: '和同事闲聊', zh: '休息时澳洲同事来找你聊天。',
    persona: 'Jess, an Australian coworker chatting during a break. Curious about China, uses Aussie slang (arvo, heaps, reckon) and asks about travel plans.',
    goal: '轻松闲聊：家乡、旅行计划、周末安排。',
    opener: "Hey, how are you finding it here so far?" },

  // ---- 💬 日常 ----
  { id: 'free', tag: 'daily', title: '青旅自由聊天', zh: '在青旅公共厨房遇到一个加拿大背包客。',
    persona: 'Ben, a relaxed and curious backpacker from Canada met in a hostel kitchen. Loves hiking and swapping travel tips, and shares his own stories too.',
    goal: '想聊什么聊什么，重点练流利度。',
    opener: "Hey! That smells good. Where are you heading next?" }
];

window.QUOTES = [
  ["The limits of my language mean the limits of my world.", "我语言的边界，就是我世界的边界。——维特根斯坦"],
  ["A journey of a thousand miles begins with a single step.", "千里之行，始于足下。"],
  ["Practice makes perfect.", "熟能生巧。"],
  ["Well begun is half done.", "好的开始是成功的一半。"],
  ["Little by little, one travels far.", "积跬步，至千里。"],
  ["Every expert was once a beginner.", "每个高手都曾是新手。"],
  ["Mistakes are proof that you are trying.", "犯错说明你在努力。"],
  ["Don't be afraid to make mistakes. Be afraid of not speaking.", "别怕犯错，怕的是不开口。"],
  ["You don't need perfect English. You need English that works.", "你不需要完美的英语，你需要能用的英语。"],
  ["The world is a book, and those who do not travel read only one page.", "世界是一本书，不旅行的人只读了其中一页。"],
  ["Slow and steady wins the race.", "稳扎稳打，方能取胜。"],
  ["The best time to plant a tree was 20 years ago. The second best time is now.", "种树最好的时间是二十年前，其次是现在。"]
];
