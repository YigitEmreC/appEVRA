// Gizlilik ve koşullar: the Turkish legal texts, the same as the Evra website's
// privacy.html (with the AI consent text at #yapay-zeka) and terms.html. Change both
// together. Shown in a full-screen sheet from the sign-in screen, Settings and the
// assistant's consent card (views/chat.js). Parts in [square brackets] are filled in
// once the company is founded.

import { h } from './util.js';
import { icon } from './icons.js';

export const LEGAL_UPDATED = '23 Kasım 2026';
// Bump when the AI consent text changes, so members are asked again (views/chat.js).
export const AI_CONSENT_VERSION = 1;

// Each document: sections of [title, blocks]; a block is a paragraph (string) or a list (array).
// "**x**" is bold.
export const DOCS = [
 {
  "id": "gizlilik",
  "title": "Gizlilik Politikası ve KVKK Aydınlatma Metni",
  "short": "Gizlilik ve KVKK",
  "lead": "Evra web sitesi (evrasmarthome.com), Evra uygulaması (app.evrasmarthome.com ve evdeki duvar ekranı) ve kurulum hizmetlerimiz sırasında kişisel verilerinizin nasıl işlendiğini 6698 sayılı Kişisel Verilerin Korunması Kanunu (KVKK) kapsamında açıklar.",
  "sections": [
   [
    "1. Veri sorumlusu",
    [
     "Kişisel verileriniz, veri sorumlusu sıfatıyla [Şirket unvanı] (\"Evra\") tarafından işlenir.",
     [
      "Veri sorumlusu: [Şirket unvanı]",
      "Adres: [Şirket adresi]",
      "Vergi dairesi / no: [Vergi dairesi] / [Vergi no] · MERSİS: [MERSİS no]",
      "E-posta: info@evrasmarthome.com · KEP: [KEP adresi]",
      "Telefon: +90 533 469 51 79"
     ]
    ]
   ],
   [
    "2. Hangi verileri işliyoruz?",
    [
     [
      "**Kimlik ve iletişim:** ad soyad, e-posta adresi, telefon numarası, kurulum ve fatura adresi.",
      "**Hesap ve güvenlik:** şifrenizin geri döndürülemez özeti (şifrenin kendisi saklanmaz), oturum kayıtları, giriş denemeleri, IP adresi ve tarayıcı bilgisi.",
      "**Sipariş ve müşteri işlemleri:** seçtiğiniz paket ve ürünler, oda yerleşimi, sipariş numarası, kapora ve ödeme durumu, abonelik planı, destek talepleriniz.",
      "**Ödeme:** kart bilgileriniz Evra'ya gelmez; doğrudan lisanslı ödeme kuruluşu iyzico'ya iletilir. iyzico, fatura için T.C. kimlik numaranızı ister; bu numara Evra'nın sistemlerinde saklanmaz.",
      "**Pazarlama:** e-posta ile haber almak isteyip istemediğiniz ve bu tercihin tarihi.",
      "**Akıllı ev verileri:** cihaz adları, odalar, cihazların durumları (açık/kapalı, sıcaklık, enerji kullanımı), otomasyonlar ve sahneler.",
      "**Yapay zekâ asistanı (yalnızca Premium):** asistana yazdığınız sorular ve yanıt için gereken cihaz bilgileri."
     ],
     "**Evinizde kalan veriler:** Akıllı ev sisteminiz evinizdeki Home Assistant merkezinde, yerel olarak çalışır. Kamera görüntüleri ve kayıtları, hareket ve kapı bilgileri, hareketsizlik uyarıları ve acil yardım butonu gibi sağlıkla ilgili olabilecek bilgiler evinizdeki cihazda işlenir ve saklanır; Evra'nın sunucularına gönderilmez. Uygulamayı ev dışından kullandığınızda bu bilgiler, evinizle telefonunuz arasında şifreli bir bağlantı (Cloudflare Tunnel) üzerinden aktarılır ve Evra tarafından kaydedilmez."
    ]
   ],
   [
    "3. Verileri hangi amaçlarla işliyoruz?",
    [
     [
      "Üyelik hesabınızı açmak, kimliğinizi doğrulamak ve hesabınızı korumak,",
      "Paket talebinizi almak, keşif, kurulum ve bakım hizmetini planlamak ve yerine getirmek,",
      "Kapora ve abonelik ödemelerini almak, fatura düzenlemek, muhasebe ve vergi yükümlülüklerimizi yerine getirmek,",
      "Uygulamanın evinize bağlanmasını, cihazlarınızı uzaktan kontrol etmenizi ve size bildirim göndermeyi sağlamak,",
      "Destek taleplerinizi yanıtlamak, garanti ve arıza süreçlerini yürütmek,",
      "Premium planda yapay zekâ asistanının sorularınıza yanıt vermesini sağlamak,",
      "İzin verdiyseniz kampanya ve yeniliklerden haberdar etmek,",
      "Spam ve kötüye kullanımı önlemek, bilgi güvenliğini sağlamak, yasal taleplere yanıt vermek."
     ]
    ]
   ],
   [
    "4. Hukuki sebepler",
    [
     [
      "**Sözleşmenin kurulması ve ifası (KVKK m.5/2-c):** üyelik, sipariş, kurulum, abonelik ve uygulamanın çalışması.",
      "**Hukuki yükümlülük (KVKK m.5/2-ç):** fatura, muhasebe ve vergi kayıtları, yetkili kurumların talepleri.",
      "**Bir hakkın tesisi, kullanılması veya korunması (KVKK m.5/2-e):** olası uyuşmazlıklar.",
      "**Meşru menfaat (KVKK m.5/2-f):** hesap güvenliği, spam önleme, hizmet kalitesi.",
      "**Açık rıza (KVKK m.5/1):** e-posta ile kampanya gönderimi ve yapay zekâ asistanı için verilerin yurt dışına aktarılması. Açık rızanızı dilediğiniz zaman geri alabilirsiniz."
     ]
    ]
   ],
   [
    "5. Verileri kimlere aktarıyoruz?",
    [
     "Verileriniz yalnızca yukarıdaki amaçlar için gerekli olduğu ölçüde şu taraflarla paylaşılır:",
     [
      "**iyzico Ödeme Hizmetleri A.Ş.** (Türkiye): kapora ve abonelik ödemeleri.",
      "**Kurulum ekibimiz ve yetkili elektrikçiler:** kurulum ve bakım için ad, telefon ve adres.",
      "**Mali müşavirimiz:** muhasebe ve vergi işlemleri.",
      "**Yetkili kamu kurum ve kuruluşları:** kanunen zorunlu hâllerde.",
      "**Cloudflare, Inc.** (yurt dışı): web sitesi ve uygulamanın barındırılması, üyelik ve sipariş veritabanı, evinize güvenli uzaktan erişim, spam koruması (Turnstile).",
      "**Resend** (yurt dışı): doğrulama, şifre yenileme ve sipariş e-postalarının gönderilmesi.",
      "**Google (Gemini)** (yurt dışı): yalnızca yapay zekâ asistanını kullanırsanız, sorunuz ve yanıt için gereken cihaz bilgileri."
     ],
     "Yurt dışına aktarım KVKK m.9'a uygun olarak yapılır: aktarım yapılan hizmet sağlayıcılarla Kurul'un belirlediği standart sözleşmeler imzalanır ve süresi içinde Kurul'a bildirilir; bunun mümkün olmadığı hâllerde, yalnızca açık rızanız bulunuyorsa aktarım yapılır."
    ]
   ],
   [
    "6. Verileri nasıl topluyoruz?",
    [
     "Verileriniz; web sitesindeki formlar (üyelik, paket talebi, iletişim, destek), Evra uygulaması, evinize kurulan Home Assistant merkezi, ödeme kuruluşundan gelen bildirimler, e-posta ve telefon görüşmeleri aracılığıyla, kısmen veya tamamen otomatik yollarla toplanır."
    ]
   ],
   [
    "7. Ne kadar süre saklıyoruz?",
    [
     [
      "**Üyelik hesabı:** hesabınızı silene kadar. Hesabınızı Hesabım sayfasından dilediğiniz zaman silebilirsiniz.",
      "**Siparişler, faturalar ve ödeme kayıtları:** Vergi Usul Kanunu ve Türk Ticaret Kanunu gereği 10 yıl. Hesabınızı silseniz de bu kayıtlar hesabınızla bağlantısı kaldırılarak saklanır.",
      "**Oturumlar:** en fazla 30 gün. **E-posta doğrulama ve şifre yenileme bağlantıları:** 48 saat ve 1 saat.",
      "**İletişim ve destek yazışmaları:** talebin sonuçlanmasından itibaren 2 yıl.",
      "**Pazarlama izni:** izninizi geri alana kadar; izin ve ret kayıtları mevzuatın öngördüğü süre boyunca.",
      "**Yapay zekâ asistanı:** sorular yalnızca yanıtın hazırlanması için kullanılır. Konuşma, sohbetin sürmesi için son mesajdan sonra en fazla 30 dakika saklanır ve ardından silinir. Aylık soru sınırı için yalnızca ay içinde sorulan soru sayısı tutulur; soruların içeriği tutulmaz."
     ],
     "Süresi dolan veriler silinir, yok edilir veya anonim hâle getirilir."
    ]
   ],
   [
    "8. Çerezler ve tarayıcıda saklanan bilgiler",
    [
     "Web sitemiz reklam veya takip çerezi ve ziyaretçi analizi aracı kullanmaz. Yalnızca hizmetin çalışması için zorunlu olanlar kullanılır:",
     [
      "**Oturum çerezleri** (evra_session, evra_in): giriş yaptığınızı hatırlamak için, en fazla 30 gün.",
      "**Tarayıcı depolaması:** sepetiniz, paket oluşturucudaki taslağınız, tema (açık/koyu) tercihiniz ve uygulama ayarlarınız yalnızca kendi cihazınızda saklanır.",
      "**Güvenlik çerezleri:** Cloudflare'ın spam ve saldırı koruması (Turnstile) için kullandığı teknik çerezler."
     ]
    ]
   ],
   [
    "9. Haklarınız (KVKK m.11)",
    [
     "Evra'ya başvurarak şu haklarınızı kullanabilirsiniz:",
     [
      "Kişisel verilerinizin işlenip işlenmediğini öğrenmek ve işlenmişse buna ilişkin bilgi talep etmek,",
      "İşlenme amacını ve amacına uygun kullanılıp kullanılmadığını öğrenmek,",
      "Yurt içinde veya yurt dışında aktarıldığı üçüncü kişileri bilmek,",
      "Eksik veya yanlış işlenmişse düzeltilmesini istemek,",
      "KVKK m.7'deki şartlar çerçevesinde silinmesini veya yok edilmesini istemek,",
      "Düzeltme ve silme işlemlerinin, verilerin aktarıldığı üçüncü kişilere bildirilmesini istemek,",
      "Münhasıran otomatik sistemlerle analiz edilmesi sonucu aleyhinize bir sonuç çıkmasına itiraz etmek,",
      "Kanuna aykırı işleme nedeniyle zarara uğramanız hâlinde zararın giderilmesini talep etmek."
     ]
    ]
   ],
   [
    "10. Nasıl başvurabilirsiniz?",
    [
     "Başvurunuzu Türkçe olarak; Evra'ya kayıtlı e-posta adresinizden info@evrasmarthome.com adresine, KEP adresimize ya da yukarıdaki adrese ıslak imzalı yazıyla iletebilirsiniz. Başvurunuzda ad soyadınızı, T.C. kimlik numaranızı (yabancılar için uyruk ve pasaport numarası), iletişim bilgilerinizi ve talebinizi açıkça belirtin.",
     "Başvurunuz en geç 30 gün içinde ücretsiz olarak sonuçlandırılır. İşlemin ayrıca bir maliyet gerektirmesi hâlinde Kişisel Verileri Koruma Kurulu'nun belirlediği tarife uygulanabilir. Yanıtımızı yeterli bulmazsanız Kişisel Verileri Koruma Kurulu'na şikâyette bulunabilirsiniz."
    ]
   ],
   [
    "11. Değişiklikler",
    [
     "Bu metni hizmetlerimiz veya mevzuat değiştikçe güncelleyebiliriz. Güncel metin her zaman bu sayfada yayımlanır; önemli değişiklikleri üyelerimize e-posta ile bildiririz."
    ]
   ]
  ]
 },
 {
  "id": "kosullar",
  "title": "Kullanım ve Satış Koşulları",
  "short": "Kullanım koşulları",
  "lead": "Evra web sitesini, Evra uygulamasını, üyelik hesabını, paket ve kurulum hizmetlerini ve abonelik planlarını kullanma koşullarını açıklar. Hizmetlerimizi kullanarak bu koşulları kabul etmiş olursunuz.",
  "sections": [
   [
    "1. Taraflar",
    [
     "Bu koşullar, [Şirket unvanı] (\"Evra\") ile Evra web sitesini veya uygulamasını kullanan, üye olan ya da Evra'dan ürün ve hizmet satın alan kişi (\"Müşteri\") arasında geçerlidir.",
     [
      "Adres: [Şirket adresi]",
      "Vergi dairesi / no: [Vergi dairesi] / [Vergi no] · MERSİS: [MERSİS no]",
      "E-posta: info@evrasmarthome.com · KEP: [KEP adresi]",
      "Telefon: +90 533 469 51 79"
     ]
    ]
   ],
   [
    "2. Üyelik ve hesap",
    [
     [
      "Üye olmak için 18 yaşını doldurmuş olmanız ve doğru bilgi vermeniz gerekir. Satın alma işlemleri için üyelik zorunludur.",
      "Aynı hesapla web sitesine, Evra uygulamasına ve evinizdeki sisteme giriş yaparsınız. Şifrenizi kimseyle paylaşmayın; hesabınızdan yapılan işlemlerden siz sorumlusunuz.",
      "Hesabınızın izinsiz kullanıldığından şüphelenirseniz şifrenizi yenileyin ve bize hemen haber verin.",
      "Bu koşulları ağır şekilde ihlal eden hesapları askıya alabilir veya kapatabiliriz."
     ]
    ]
   ],
   [
    "3. Paketler, fiyatlar ve sipariş",
    [
     [
      "Sitedeki fiyatlar Türk lirası ve KDV dahildir. Paket fiyatına ürünler, kurulum, kullanım eğitimi ve paket açıklamasında belirtilen hizmetler dahildir.",
      "Hazır paketlere eklediğiniz ekstra ürünlerin fiyatı, sizinle yapacağımız görüşmede netleşir ve onayınız olmadan siparişe eklenmez.",
      "Paket talebi gönderdiğinizde paket fiyatının %20'si kadar kapora alınır. Kapora havale/EFT ile veya iyzico üzerinden kartla ödenebilir.",
      "Sipariş; kaporanın alınması ve kurulum randevusunun birlikte belirlenmesiyle kesinleşir. Satış öncesinde mesafeli satış mevzuatının gerektirdiği ön bilgilendirme ve sözleşme metinleri ayrıca sunulur.",
      "Kalan tutar kurulum günü veya birlikte kararlaştırılan şekilde ödenir."
     ]
    ]
   ],
   [
    "4. Cayma hakkı, iptal ve iade",
    [
     [
      "Mesafeli Sözleşmeler Yönetmeliği uyarınca, kurulum yapılmadan önce siparişinizi 14 gün içinde gerekçe göstermeden iptal edebilirsiniz; ödediğiniz kapora 14 gün içinde aynı ödeme yöntemiyle iade edilir.",
      "Sizin onayınızla kurulumuna başlanan hizmetlerde ve evinize özel hazırlanan paketlerde, mevzuatın izin verdiği ölçüde cayma hakkı kullanılamaz.",
      "Kurulum randevusunu en az 24 saat önce haber vererek ücretsiz olarak değiştirebilirsiniz.",
      "Ayıplı (kusurlu) ürünlerde 6502 sayılı Tüketicinin Korunması Hakkında Kanun'dan doğan haklarınız saklıdır."
     ]
    ]
   ],
   [
    "5. Kurulum",
    [
     [
      "Kurulum için evinize erişim sağlamanız, uygun elektrik tesisatı ve internet bağlantısı bulunması gerekir. Elektrik tesisatına dokunan işler yetkili elektrikçi tarafından yapılır.",
      "Evinizdeki mevcut cihazların (klima, TV, kombi vb.) sistemle uyumu keşif sırasında kontrol edilir; uyumsuz cihazlar için size alternatif önerilir.",
      "Kurulumdan sonra sistemi size teslim eder ve kullanımını anlatırız."
     ]
    ]
   ],
   [
    "6. Garanti",
    [
     [
      "Ürünler, üretici ve ithalatçı garantisi kapsamındadır; yeni ürünlerde yasal garanti süresi en az 2 yıldır.",
      "Kurulum işçiliğimiz, kurulum tarihinden itibaren [12 ay] garantilidir.",
      "Kullanım hatası, yetkisiz müdahale, yıldırım, su baskını, elektrik dalgalanması gibi durumlardan kaynaklanan arızalar garanti kapsamında değildir."
     ]
    ]
   ],
   [
    "7. Abonelik planları",
    [
     [
      "**Temel** plan ücretsizdir. **Güvence** ve **Premium** planlar aylık ücretlidir; ücret ve kapsam, Servisler sayfasındaki karşılaştırma tablosunda yazılıdır.",
      "Ücretli planlar kurulumdan sonra başlar ve iyzico üzerinden kaydettiğiniz kartınızdan her ay otomatik olarak yenilenir.",
      "Planınızı dilediğiniz zaman değiştirebilir veya iptal edebilirsiniz; iptal, içinde bulunulan dönemin sonunda geçerli olur ve geçmiş dönemler için iade yapılmaz.",
      "Plan ücretlerindeki değişiklikler en az 30 gün önce e-posta ile bildirilir; kabul etmezseniz planınızı ücretsiz iptal edebilirsiniz.",
      "Ödeme alınamazsa ücretli plan özellikleri askıya alınabilir; evinizdeki sistem Temel plan özellikleriyle çalışmaya devam eder."
     ]
    ]
   ],
   [
    "8. Yapay zekâ asistanı (Premium)",
    [
     [
      "Evra Asistan, yapay zekâ ile çalışır ve yanıtları otomatik olarak üretilir; yanıtlar eksik veya hatalı olabilir.",
      "Asistanın hazırladığı her değişiklik (otomasyon kurma, cihaz ekleme veya çıkarma, ayar değiştirme) size bir kart olarak gösterilir ve **siz onaylamadan uygulanmaz.** Onayladığınız değişikliklerden siz sorumlusunuz.",
      "Asistanı kullanmak için sorularınızın ve cihaz bilgilerinizin Google'a aktarılmasına açık rıza vermeniz gerekir (bkz. Gizlilik Politikası).",
      "Asistan kötüye kullanılamaz; makul kullanım sınırları uygulanabilir."
     ]
    ]
   ],
   [
    "9. Güvenlik ürünlerinin sınırları",
    [
     [
      "Evra bir alarm izleme merkezi veya acil yardım servisi değildir. Duman, gaz, su, hareket ve acil yardım bildirimleri; internet, elektrik veya mobil şebeke kesintilerinde gecikebilir ya da ulaşmayabilir.",
      "**Acil durumlarda her zaman 112'yi arayın.**",
      "Sensörlerin pillerini, bildirim ayarlarını ve acil durumda haber verilecek kişileri güncel tutmak sizin sorumluluğunuzdadır."
     ]
    ]
   ],
   [
    "10. Uzaktan erişim ve destek",
    [
     "Destek ve bakım için sisteminize uzaktan yalnızca sizin izninizle ve gerektiği kadar bağlanırız. Kamera görüntülerinize erişmeyiz."
    ]
   ],
   [
    "11. Fikri mülkiyet",
    [
     "Evra adı, logosu, web sitesi ve uygulamanın tasarımı, metinleri ve yazılımı Evra'ya veya lisans verenlerine aittir; izinsiz kopyalanamaz ve ticari amaçla kullanılamaz."
    ]
   ],
   [
    "12. Sorumluluğun sınırı",
    [
     "Evra; internet, elektrik veya üçüncü taraf hizmetlerindeki (Cloudflare, iyzico, Google, cihaz üreticileri) kesintilerden ve bu koşullara aykırı kullanımdan doğan zararlardan, kasıt veya ağır ihmali bulunmadıkça sorumlu değildir. Bu madde, tüketici mevzuatından doğan haklarınızı sınırlamaz."
    ]
   ],
   [
    "13. Değişiklikler",
    [
     "Bu koşulları güncelleyebiliriz. Güncel metin her zaman bu sayfada yayımlanır; önemli değişiklikleri üyelerimize e-posta ile bildiririz."
    ]
   ],
   [
    "14. Uygulanacak hukuk ve uyuşmazlıklar",
    [
     "Bu koşullar Türk hukukuna tabidir. Tüketici uyuşmazlıklarında, her yıl belirlenen parasal sınırlar içinde Tüketici Hakem Heyetlerine, bu sınırların üzerinde Tüketici Mahkemelerine başvurabilirsiniz."
    ]
   ]
  ]
 },
 {
  "id": "yapayzeka",
  "title": "Yapay Zekâ Asistanı Açık Rıza Metni",
  "short": "Yapay zekâ onayı",
  "lead": "Evra Asistan'ı (Premium) kullanmadan önce okuyun.",
  "sections": [
   [
    "Asistan hangi verileri kullanır?",
    [
     [
      "Asistana yazdığınız veya söylediğiniz sorular,",
      "Mikrofonla sorarsanız sesiniz, tarayıcınızın veya telefonunuzun kendi ses tanıma hizmetinde (Google ya da Apple) yazıya çevrilir; Evra'ya yalnızca yazıya çevrilmiş soru gelir, ses kaydı alınmaz ve saklanmaz,",
      "Yanıt için gereken cihaz bilgileri: cihaz ve oda adları, cihazların durumları, otomasyonlar ve sahneler."
     ],
     "Adınız, e-posta adresiniz, adresiniz ve telefon numaranız; kamera görüntüleri, kilit ve alarm bilgileri, evdeki kişilerin konumları, Home Assistant oturumunuz, şifreler ve ödeme bilgileri asistana gönderilmez."
    ]
   ],
   [
    "Veriler nereye gider?",
    [
     "Yanıtlar, Google'ın Gemini yapay zekâ hizmetiyle üretilir. Bu nedenle sorularınız ve yukarıdaki cihaz bilgileri, Evra'nın asistan sunucusu (Cloudflare) üzerinden Google'ın yurt dışındaki sunucularına aktarılır (KVKK m.9). Asistan evinize bağlanmaz ve hiçbir değişikliği kendisi yapmaz; değişiklikleri siz onayladıktan sonra uygulama yapar.",
     "Konuşmalar yalnızca yanıtın hazırlanması için kullanılır. Sohbetin sürmesi için son mesajınızdan sonra en fazla 30 dakika saklanır, sonra silinir; \"Yeni sohbet\" ile hemen silinir. Aylık soru sınırı için yalnızca soru sayınız tutulur."
    ]
   ],
   [
    "Onay ve geri alma",
    [
     "Bu metni onaylayarak, yukarıdaki verilerin yapay zekâ asistanının çalışması için yurt dışına aktarılmasına açık rıza vermiş olursunuz. Onay vermezseniz asistanı kullanamazsınız; uygulamanın diğer bütün özellikleri çalışmaya devam eder.",
     "Onayınızı dilediğiniz zaman Ayarlar → Gizlilik ve koşullar bölümünden geri alabilirsiniz. Ayrıntılar için Gizlilik Politikası ve KVKK Aydınlatma Metni'ne bakın."
    ]
   ]
  ]
 }
];

// "**x**" → <strong>x</strong>, everything else as text (never innerHTML).
function rich(text) {
  return text.split(/\*\*(.+?)\*\*/g).map((part, i) => (i % 2 ? h('strong', null, part) : part));
}

/** Opens the texts on top of everything; id: 'gizlilik' | 'kosullar' | 'yapayzeka'. */
export function openLegal(id = 'gizlilik') {
  document.querySelector('.legal-overlay')?.remove();
  const before = document.activeElement;
  let current = id;
  const tabs = h('div', { class: 'segmented legal-tabs', role: 'tablist', 'aria-label': 'Yasal metinler' });
  const body = h('div', { class: 'legal-body', tabindex: '-1' });
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  const close = () => {
    sheet.remove();
    document.removeEventListener('keydown', onKey);
    before?.focus?.();
  };
  function draw() {
    const doc = DOCS.find((d) => d.id === current) || DOCS[0];
    tabs.replaceChildren(...DOCS.map((d) => h('button', {
      type: 'button', role: 'tab', 'aria-selected': String(d.id === current), class: d.id === current ? 'active' : '',
      onclick: () => { current = d.id; draw(); },
    }, d.short)));
    body.replaceChildren(
      h('h2', null, doc.title),
      h('p', { class: 'muted small' }, `Son güncelleme: ${LEGAL_UPDATED}`),
      h('p', { class: 'legal-lead' }, ...rich(doc.lead)),
      ...doc.sections.flatMap(([title, blocks]) => [
        h('h3', null, title),
        ...blocks.map((b) => (Array.isArray(b) ? h('ul', null, b.map((li) => h('li', null, ...rich(li)))) : h('p', null, ...rich(b)))),
      ]));
    body.scrollTop = 0;
  }
  const sheet = h('div', {
    class: 'legal-overlay', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Gizlilik ve koşullar',
    onclick: (e) => { if (e.target === sheet) close(); },
  },
  h('div', { class: 'legal-sheet' },
    h('header', { class: 'legal-head' }, tabs,
      h('button', { class: 'legal-close', type: 'button', 'aria-label': 'Kapat', onclick: close }, icon('close', 18))),
    body));
  draw();
  document.body.append(sheet);
  document.addEventListener('keydown', onKey);
  body.focus();
}
