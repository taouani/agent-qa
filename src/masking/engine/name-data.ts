/**
 * Word lists for name detection without a known list (S1-5). Given names are
 * common ones per language, folded (lowercase, no accents). They are facts,
 * not a copied dataset; the lists favour recall over completeness, since a
 * surname after a title is caught anyway.
 */

const list = (s: string) => s.split(/\s+/).filter(Boolean);

export const GIVEN_NAMES: Record<string, string[]> = {
  en: list(`
    james john robert michael william david richard joseph thomas charles christopher daniel matthew anthony mark
    donald steven paul andrew joshua kenneth kevin brian george timothy ronald edward jason jeffrey ryan jacob gary
    nicholas eric jonathan stephen larry justin scott brandon benjamin samuel gregory alexander frank patrick raymond
    jack dennis jerry tyler aaron jose adam nathan henry douglas zachary peter kyle noah ethan jeremy walter christian
    keith roger terry austin sean gerald carl harold dylan arthur lawrence jordan jesse bryan billy bruce gabriel joe
    logan alan juan albert willie elijah wayne randy vincent liam oliver lucas mason harry oscar charlie alfie leo
    mary patricia jennifer linda elizabeth barbara susan jessica sarah karen lisa nancy betty sandra margaret ashley
    kimberly emily donna michelle carol amanda melissa deborah stephanie dorothy rebecca sharon laura cynthia amy
    kathleen angela shirley brenda emma anna pamela nicole samantha katherine christine helen debra rachel carolyn
    janet maria catherine heather diane olivia julie joyce victoria ruth virginia lauren kelly christina joan evelyn
    judith andrea hannah megan cheryl jacqueline martha madison teresa gloria sara janice ann kathryn abigail sophia
    frances jean alice judy isabella julia denise amber doris marilyn danielle beverly charlotte natalie theresa
    diana brittany kayla alexis lori ava mia amelia isla poppy ella freya chloe lily jessica zoe
  `),
  fr: list(`
    jean pierre michel andre philippe rene louis alain jacques bernard marcel daniel roger robert paul claude christian
    henri georges nicolas francois patrick gerard christophe joseph julien laurent frederic eric stephane pascal david
    sebastien olivier thierry vincent maxime thomas alexandre antoine guillaume romain mathieu benoit cedric damien
    fabrice franck gilles herve jerome lionel ludovic mickael raphael remi sylvain xavier yann yves hugo lucas theo
    gabriel arthur jules adam raphael leo enzo nathan mathis clement baptiste quentin florian kevin dylan loic
    marie jeanne francoise monique catherine nathalie isabelle jacqueline sylvie anne martine christine nicole
    suzanne helene valerie sandrine sophie celine stephanie aurelie laetitia julie emilie camille chloe manon lea
    ines lucie clara emma jade louise alice lina rose anais oceane margaux pauline mathilde elodie audrey caroline
    marguerite josephine juliette eloise solene victoire virginie veronique florence brigitte chantal colette danielle denise genevieve josette madeleine odile simone
    therese yvette agnes beatrice claire delphine estelle fabienne gaelle helene laure marion morgane noemie
  `),
  es: list(`
    antonio jose manuel francisco juan david javier jesus daniel carlos miguel alejandro rafael pedro angel pablo
    sergio fernando jorge luis alberto alvaro diego adrian raul enrique ramon vicente ignacio andres joaquin santiago
    eduardo victor roberto jaime mario ruben oscar marcos hugo iker gonzalo emilio julian rodrigo guillermo lucas
    mateo martin nicolas leo alvaro tomas felipe agustin esteban gustavo hector ricardo sebastian cristian
    maria carmen ana isabel dolores pilar teresa rosa josefa cristina laura marta antonia francisca lucia elena
    mercedes manuela concepcion raquel sara paula rocio beatriz silvia patricia nuria julia irene alba andrea
    sofia valeria valentina camila daniela gabriela mariana ximena catalina natalia carolina claudia veronica
    adriana alejandra lorena monica susana yolanda inmaculada montserrat esperanza consuelo encarnacion
  `),
  de: list(`
    peter michael thomas andreas wolfgang klaus jurgen gunter stefan christian uwe werner horst frank dieter manfred
    bernd hans markus matthias martin jorg sven karl heinz helmut gerhard rainer ralf dirk tobias florian alexander
    sebastian daniel jan tim lukas leon finn jonas paul felix maximilian elias noah luca ben luis henry emil anton
    moritz niklas philipp julian fabian dominik kai lars nils torsten ulrich volker wilhelm friedrich otto ernst
    ursula monika petra elisabeth sabine renate helga karin brigitte ingrid erika andrea gisela susanne christa
    claudia gabriele heike birgit martina stefanie nicole katharina julia anna lena laura lea hannah sophie mia
    emma marie lina ella clara leonie johanna greta frieda ida mathilda charlotte luise amelie annika anja antje
    beate bettina dagmar doris elke frauke gudrun hildegard inge jutta kerstin margit marlies silke ute waltraud
  `),
  pt: list(`
    jose joao antonio francisco carlos paulo pedro lucas luiz marcos luis gabriel rafael daniel marcelo bruno eduardo
    felipe raimundo rodrigo manuel nuno rui tiago diogo goncalo duarte afonso tomas martim rodrigo vasco miguel
    henrique gustavo leonardo matheus guilherme vinicius thiago andre fabio sergio ricardo fernando alexandre
    maria ana francisca antonia adriana juliana marcia fernanda patricia aline sandra camila amanda bruna jessica
    leticia julia luciana vanessa mariana gabriela beatriz carolina ines leonor matilde margarida joana catarina
    rita sofia teresa filipa raquel sara helena isabel conceicao fatima graca rosario lurdes manuela paula
  `),
  nl: list(`
    jan johannes hendrik cornelis pieter willem jacobus gerrit dirk adrianus petrus theodorus martinus wouter bram
    daan sem lucas levi luuk milan jesse thijs lars stijn ruben tim bas joost niels koen sander jeroen maarten
    bart rob erik marco dennis mark ronald frank arjan hans kees henk joop sjaak ruud wim gert bert evert
    maria johanna cornelia elisabeth anna hendrika wilhelmina geertruida catharina adriana petronella jacoba
    emma julia sophie tess zoe sara eva lotte anna fenna lisa noor milou fleur iris sanne femke anouk lieke
    marieke ingrid annemiek astrid ellen esther marloes mirjam monique petra renske willemijn yvonne
  `),
  it: list(`
    giuseppe giovanni antonio mario luigi francesco angelo vincenzo pietro salvatore carlo franco domenico bruno
    paolo michele giorgio aldo sergio luciano marco andrea alessandro stefano roberto massimo davide matteo lorenzo
    leonardo riccardo tommaso gabriele federico simone luca fabio claudio enrico emanuele filippo nicola raffaele
    maria anna giuseppina rosa angela giovanna teresa lucia carmela caterina francesca antonietta elena laura
    chiara sara giulia martina alessia valentina federica silvia paola roberta daniela cristina simona barbara
    sofia aurora ginevra beatrice alice ludovica emma greta vittoria bianca arianna serena elisa ilaria monica
  `),
  ar: list(`
    mohamed mohammed muhammad mohammad ahmed ahmad ali omar umar youssef yousef yusuf ibrahim mustafa mostafa hassan
    hussein hosni khaled khalid abdullah abdallah abdelaziz abdulaziz abdelkader abdelrahman abdulrahman abderrahim
    karim kareem said saeed samir sami tarek tariq walid waleed nabil hamza bilal anas amine amin ayoub mehdi
    rachid rashid nasser naser fahd faisal faycal hicham hisham jamal jamel kamal mahmoud mourad murad nour
    othman osman reda ridha salah saleh sofiane sufyan yassine yasin younes yunus zakaria zakariya adil adel
    fatima fatma aicha aisha aysha khadija khadidja maryam meriem mariam zineb zainab zaynab salma sara nadia
    amina layla leila hind hanane hanan imane iman samira soumaya sanaa nawal rania noura nora asma houda huda
    yasmine yasmina malika latifa naima rachida karima souad wafa ghada dina lina mona reem rim
  `),
};

/** Given names written in Arabic script. */
export const ARABIC_GIVEN_NAMES = list(`
  محمد أحمد احمد علي عمر يوسف إبراهيم ابراهيم مصطفى حسن حسين خالد عبدالله عبد عبدالعزيز عبدالرحمن كريم سعيد سمير سامي
  طارق وليد نبيل حمزة بلال أنس أمين أيوب مهدي رشيد ناصر فهد فيصل هشام جمال كمال محمود مراد نور عثمان رضا صلاح صالح
  سفيان ياسين يونس زكريا عادل فاطمة عائشة خديجة مريم زينب سلمى سارة نادية أمينة ليلى هند حنان إيمان ايمان سميرة سمية
  سناء نوال رانيا نورة أسماء هدى ياسمين مليكة لطيفة نعيمة رشيدة كريمة سعاد وفاء غادة دينا لينا منى ريم
`);

/** Titles that come before a name. Folded, without the trailing dot. */
export const TITLES = list(`
  mr mrs ms miss mx dr prof sir madam dame
  m mme mlle monsieur madame mademoiselle maitre
  sr sra srta senor senora senorita don dona dna
  herr frau hr fr
  sig sigra ra ssa signor signora signorina dott dottssa ing avv
  dhr mevr mw heer mevrouw
  snr exmo exma
  sayed sayyid sayyida sheikh cheikh hajj haj
`);

export const ARABIC_TITLES = list(`السيد السيدة الأستاذ الاستاذ الأستاذة الدكتور الدكتورة المهندس المهندسة الشيخ الحاج`);

/** Particles inside a name: "van der Berg", "de la Cruz", "bin Laden", "dos Santos". */
export const PARTICLES = new Set(list(`van von der den de del della di da dos das du la le los las al el bin ben ibn abu ter ten zu`));

/** Common Chinese surnames, single and compound. */
export const CHINESE_SURNAMES = list(`
  王 李 张 刘 陈 杨 黄 赵 吴 周 徐 孙 马 朱 胡 郭 何 高 林 罗 郑 梁 谢 宋 唐 许 韩 冯 邓 曹 彭 曾 肖 田 董 袁 潘 于 蒋 蔡
  余 杜 叶 程 苏 魏 吕 丁 任 沈 姚 卢 姜 崔 钟 谭 陆 汪 范 金 石 廖 贾 夏 韦 付 傅 方 白 邹 孟 熊 秦 邱 江 尹 薛 闫 段 雷 侯
  龙 史 陶 黎 贺 顾 毛 郝 龚 邵 万 钱 严 覃 武 戴 莫 孔 向 汤 欧阳 司马 诸葛 上官 东方 皇甫 慕容 令狐
`);

/** Words after a Chinese name that confirm it: 先生 (Mr), 女士 (Ms), 经理 (manager)... */
export const CHINESE_TITLES_AFTER = list(`先生 女士 小姐 经理 老师 总监 主管 工程师 同学 医生 律师 教授 博士 总 姐 哥`);

/**
 * Characters that usually start the word after a name (verbs, particles,
 * conjunctions): a cued name stops before them, so 请张伟确认 gives 张伟.
 */
export const CHINESE_STOP_AFTER = new Set([..."说是的在已和与及确负处审提批同要会将把被给对来去也都还就才让找问回发看做了吗呢吧讨完认参反跟正"]);

/** Words before a Chinese name that confirm it: 联系人 (contact), 客户 (customer), 负责人 (owner)... */
export const CHINESE_CUES_BEFORE = list(`联系人 客户 负责人 用户 姓名 申请人 经办人 审批人 报告人 处理人 提交人 由 致 请 联系 通知 发给 抄送 尊敬的 亲爱的 和 与 跟 给 让 找 问`);

/**
 * Two-character words that start with a surname character but are not names:
 * 谢谢 (thanks), 周末 (weekend), 高级 (advanced)... A candidate that is one of
 * these, or starts one, is left alone.
 */
export const CHINESE_NOT_NAMES = new Set(list(`
  谢谢 周末 周一 周二 周三 周四 周五 周六 周日 周期 周年 周围 周边 张贴 高级 高度 高效 高速 方法 方案 方向 方式 方便 方面
  于是 于此 马上 马达 金额 金融 石油 白色 白天 万一 万元 向上 向下 江湖 龙头 历史 史上 陈述 陈列 黄色 黄金 林业 杨树 曾经
  韩国 李子 刘海 程序 程度 苏醒 任务 任何 任意 范围 余额 余下 杜绝 叶子 钟表 钟点 陆续 陆地 夏天 夏季 付款 付费 熊猫 段落
  雷达 陶瓷 黎明 贺卡 顾客 顾问 毛巾 毛利 钱包 严重 严格 武器 莫名 汤圆 田地 董事 潘多 蒋介 蔡司 沈阳 卢布 姜汁
  谭雅 汪洋 贾宝 秦朝 邱比 江西 江苏 尹力 薛定 闫王 侯爵 龙门 毛泽 郝思 龚自 邵氏 覃塘 戴上 孔雀 汤匙 王国 王者
  张开 陈旧 杨柳 赵国 吴国 周到 徐徐 孙子 朱红 胡乱 郭外 何时 何处 何必 林子 罗列 郑重 梁山 宋朝 唐朝 许多 许可
  邓州 曾国 肖像 田野 袁世 于今 程控 苏州 魏国 丁点 任职 沈默 姚家 卢沟 崔莺 钟情 谭嗣 陆军 汪精
  范例 金子 石头 廖廖 贾乃 夏日 韦伯 付出 傅里 方才 白银 孟子 熊熊 秦岭 邱园 尹氏 段时 雷同 侯门 龙虾 史诗 陶冶
  黎巴 贺岁 顾及 毛病 郝家 龚家 邵家 万能 钱币 严禁 覃家 武汉 戴尔 莫斯 向往 汤姆 高兴 高中 高考 方针 白板 金牌 马克
  周报 周会 白名 向导 高亮 高端 高层 高于 张三 李四 王五
`));

/** Chinese surname characters that are far more often a word (于 "at", "than"): a name only with a title after. */
export const CHINESE_WEAK_SURNAMES = new Set(["于", "向"]);

/**
 * Latin given names that are also everyday words or months (Amber in a RAG
 * status, Jan for January): a name only with a surname part next to them.
 */
export const AMBIGUOUS_GIVEN = new Set(list(`
  amber jan victoria april june august rose ruby jade summer hope faith joy iris lily poppy olive ivy dawn crystal
  pearl aurora alba bianca fleur noor sky river eve felix
`));

/**
 * Arabic given names that are also everyday adjectives or nouns (صالح "valid",
 * رضا "satisfaction", حسن "good"): a name only after a title or with another
 * name part.
 */
/** Everyday ال words that follow an ambiguous given name without being a family name. */
export const ARABIC_AL_WORDS = new Set(list(`
  العملاء العميل الطلب الطلبات المستخدم المستخدمين النظام الخدمة الخدمات الموظفين الموظف الحساب البيانات الفريق
  الإدارة الادارة المشروع العمل الجودة التطبيق الموقع الشركة المنتج المنتجات الدعم السعر الحالة
`));

export const ARABIC_AMBIGUOUS = new Set(list(`صالح رضا حسن سعيد كريم أمين نور جمال كمال عادل وفاء هدى منى نبيل أمينة كريمة سعاد غادة`));

/**
 * Capitalised words in requirement text that are roles, products or UI terms,
 * never a surname: "Sr. Account Executive", "HR Portal", "Jan Release".
 */
export const NOT_SURNAMES = new Set(list(`
  executive executives developer developers manager managers director engineer engineers analyst architect consultant
  administrator reviewer reviewers approver approvers representative rep agent agents officer specialist lead
  review portal site translation later bank api region release releases team teams channel channels update updates
  opportunity opportunities quote quotes service services cloud platform system systems module feature features
  project projects sprint board ticket tickets issue issues epic story stories bug bugs request requests approval
  role roles profile profiles group groups queue dashboard app apps console center centre desk hub support sales
  marketing finance legal partner customer customers client clients vendor supplier integration flow flows process
  rule rules template templates object objects layout tab button link menu panel form section item items data batch
  job jobs schedule meeting call message notification alert summary details overview settings configuration version
  build environment sandbox production org experience community communities office department branch store
  thanks thank regards cheers best hi hello dear greetings grusse gruesse danke merci cordialement bonjour gracias
  saludos hola obrigado obrigada ola grazie saluti ciao groeten bedankt hallo
`));
