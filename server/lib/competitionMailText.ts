// v3.166 — e-mail / notice texts of the "new competition" announcement, in the
// 17 app languages. The recipient gets it in their own app language
// (users.language), otherwise in the language of their country, otherwise
// English. Plain data + two helpers; no imports.

export interface CompetitionMailText {
  prefix: string; // subject prefix, e.g. "New competition"
  open: string;   // sentence with {t} = competition title
  cta: string;    // register button text
  f1: string;     // footer: why you receive this
  unsub: string;  // unsubscribe link text
  f2: string;     // footer: switch off in Profile
}

export const COMPETITION_MAIL: Record<string, CompetitionMailText> = {
  "bg": {
    "prefix": "Ново състезание",
    "open": "Състезанието „{t}“ е отворено за регистрация.",
    "cta": "Регистрирай се",
    "f1": "Получавате това съобщение, защото сте регистриран потребител на CatchCount и сте приели общите условия, които включват известия за организирани състезания.",
    "unsub": "Откажи получаването на известия за състезания",
    "f2": "Можете да ги изключите и по всяко време от Профил → Известия за състезания."
  },
  "en": {
    "prefix": "New competition",
    "open": "The competition \"{t}\" is open for registration.",
    "cta": "Register",
    "f1": "You are receiving this message because you are a registered CatchCount user and have accepted the terms, which include notifications about organized competitions.",
    "unsub": "Stop competition notifications",
    "f2": "You can also switch them off at any time in Profile → Competition notifications."
  },
  "cs": {
    "prefix": "Nová soutěž",
    "open": "Soutěž „{t}“ je otevřena pro registraci.",
    "cta": "Zaregistrovat se",
    "f1": "Tuto zprávu dostáváte, protože jste registrovaným uživatelem CatchCount a přijali jste obchodní podmínky, které zahrnují oznámení o pořádaných soutěžích.",
    "unsub": "Přestat dostávat oznámení o soutěžích",
    "f2": "Můžete je také kdykoli vypnout v Profil → Oznámení o soutěžích."
  },
  "de": {
    "prefix": "Neuer Wettbewerb",
    "open": "Der Wettbewerb „{t}“ ist für die Anmeldung geöffnet.",
    "cta": "Jetzt anmelden",
    "f1": "Sie erhalten diese Nachricht, weil Sie registrierter CatchCount-Nutzer sind und die Allgemeinen Geschäftsbedingungen akzeptiert haben, die Benachrichtigungen über veranstaltete Wettbewerbe einschließen.",
    "unsub": "Wettbewerbs-Benachrichtigungen abbestellen",
    "f2": "Sie können sie auch jederzeit unter Profil → Wettbewerbs-Benachrichtigungen deaktivieren."
  },
  "es": {
    "prefix": "Nueva competición",
    "open": "La competición «{t}» está abierta a inscripciones.",
    "cta": "Inscribirme",
    "f1": "Recibes este mensaje porque eres un usuario registrado de CatchCount y has aceptado los términos, que incluyen avisos sobre competiciones organizadas.",
    "unsub": "Dejar de recibir notificaciones de competiciones",
    "f2": "También puedes desactivarlas en cualquier momento en Perfil → Notificaciones de competiciones."
  },
  "fr": {
    "prefix": "Nouvelle compétition",
    "open": "La compétition « {t} » est ouverte aux inscriptions.",
    "cta": "S'inscrire",
    "f1": "Vous recevez ce message car vous êtes un utilisateur inscrit de CatchCount et avez accepté les conditions générales, qui incluent des notifications sur les compétitions organisées.",
    "unsub": "Ne plus recevoir les notifications de compétitions",
    "f2": "Vous pouvez aussi les désactiver à tout moment dans Profil → Notifications de compétitions."
  },
  "hu": {
    "prefix": "Új verseny",
    "open": "A(z) „{t}” verseny regisztrációra nyitva áll.",
    "cta": "Regisztrálok",
    "f1": "Azért kapja ezt az üzenetet, mert regisztrált CatchCount-felhasználó, és elfogadta az általános feltételeket, amelyek a szervezett versenyekről szóló értesítéseket is tartalmazzák.",
    "unsub": "Leiratkozás a versenyértesítésekről",
    "f2": "Bármikor kikapcsolhatja a Profil → Versenyértesítések menüben is."
  },
  "it": {
    "prefix": "Nuova competizione",
    "open": "La competizione «{t}» è aperta alle iscrizioni.",
    "cta": "Iscriviti",
    "f1": "Ricevi questo messaggio perché sei un utente registrato di CatchCount e hai accettato i termini, che includono le notifiche sulle competizioni organizzate.",
    "unsub": "Non ricevere più notifiche sulle competizioni",
    "f2": "Puoi disattivarle in qualsiasi momento anche da Profilo → Notifiche delle competizioni."
  },
  "mk": {
    "prefix": "Нов натпревар",
    "open": "Натпреварот „{t}“ е отворен за пријавување.",
    "cta": "Пријави се",
    "f1": "Ја добивате оваа порака затоа што сте регистриран корисник на CatchCount и ги прифативте општите услови, кои вклучуваат известувања за организирани натпревари.",
    "unsub": "Не ми испраќај известувања за натпревари",
    "f2": "Можете да ги исклучите и во секое време од Профил → Известувања за натпревари."
  },
  "nl": {
    "prefix": "Nieuwe wedstrijd",
    "open": "De wedstrijd „{t}” staat open voor inschrijving.",
    "cta": "Inschrijven",
    "f1": "Je ontvangt dit bericht omdat je een geregistreerde CatchCount-gebruiker bent en de voorwaarden hebt geaccepteerd, waarin meldingen over georganiseerde wedstrijden zijn opgenomen.",
    "unsub": "Geen wedstrijdmeldingen meer ontvangen",
    "f2": "Je kunt ze ook op elk moment uitzetten via Profiel → Wedstrijdmeldingen."
  },
  "pl": {
    "prefix": "Nowe zawody",
    "open": "Zawody „{t}” są otwarte do zapisów.",
    "cta": "Zapisz się",
    "f1": "Otrzymujesz tę wiadomość, ponieważ jesteś zarejestrowanym użytkownikiem CatchCount i zaakceptowałeś regulamin, który obejmuje powiadomienia o organizowanych zawodach.",
    "unsub": "Wypisz mnie z powiadomień o zawodach",
    "f2": "Możesz je też wyłączyć w dowolnym momencie w Profil → Powiadomienia o zawodach."
  },
  "ro": {
    "prefix": "Competiție nouă",
    "open": "Competiția „{t}” este deschisă pentru înscriere.",
    "cta": "Înscrie-te",
    "f1": "Primești acest mesaj pentru că ești utilizator înregistrat CatchCount și ai acceptat termenii, care includ notificări despre competițiile organizate.",
    "unsub": "Nu mai primi notificări despre competiții",
    "f2": "Le poți dezactiva oricând și din Profil → Notificări despre competiții."
  },
  "ru": {
    "prefix": "Новое соревнование",
    "open": "Соревнование «{t}» открыто для регистрации.",
    "cta": "Зарегистрироваться",
    "f1": "Вы получили это сообщение, потому что вы зарегистрированный пользователь CatchCount и приняли условия, включающие уведомления об организуемых соревнованиях.",
    "unsub": "Отписаться от уведомлений о соревнованиях",
    "f2": "Вы также можете отключить их в любое время в разделе Профиль → Уведомления о соревнованиях."
  },
  "sk": {
    "prefix": "Nová súťaž",
    "open": "Súťaž „{t}“ je otvorená na registráciu.",
    "cta": "Registrovať sa",
    "f1": "Túto správu dostávate, pretože ste registrovaným používateľom CatchCount a prijali ste podmienky, ktoré zahŕňajú oznámenia o organizovaných súťažiach.",
    "unsub": "Prestať dostávať oznámenia o súťažiach",
    "f2": "Môžete ich tiež kedykoľvek vypnúť v Profil → Oznámenia o súťažiach."
  },
  "sr": {
    "prefix": "Novo takmičenje",
    "open": "Takmičenje „{t}“ je otvoreno za prijavu.",
    "cta": "Prijavi se",
    "f1": "Primate ovu poruku jer ste registrovani korisnik CatchCount-a i prihvatili ste uslove korišćenja, koji uključuju obaveštenja o organizovanim takmičenjima.",
    "unsub": "Prestani da primaš obaveštenja o takmičenjima",
    "f2": "Možete ih isključiti i u bilo kom trenutku u Profil → Obaveštenja o takmičenjima."
  },
  "tr": {
    "prefix": "Yeni yarışma",
    "open": "“{t}” yarışması kayıt için açıldı.",
    "cta": "Kayıt ol",
    "f1": "Bu mesajı, kayıtlı bir CatchCount kullanıcısı olduğunuz ve düzenlenen yarışmalarla ilgili bildirimleri içeren koşulları kabul ettiğiniz için alıyorsunuz.",
    "unsub": "Yarışma bildirimlerini durdur",
    "f2": "Bunları istediğiniz zaman Profil → Yarışma bildirimleri bölümünden de kapatabilirsiniz."
  },
  "uk": {
    "prefix": "Нове змагання",
    "open": "Змагання «{t}» відкрито для реєстрації.",
    "cta": "Зареєструватися",
    "f1": "Ви отримали це повідомлення, бо ви зареєстрований користувач CatchCount і прийняли умови, що включають сповіщення про організовані змагання.",
    "unsub": "Припинити сповіщення про змагання",
    "f2": "Ви також можете вимкнути їх будь-коли в розділі Профіль → Сповіщення про змагання."
  }
};

// ISO country → app language (same data as src/lib/countries.js; countries whose
// own language is not translated in the app map to the closest supported one).
export const COUNTRY_LANGUAGE: Record<string, string> = {"BG": "bg", "GB": "en", "US": "en", "IE": "en", "AU": "en", "NZ": "en", "CA": "en", "ZA": "en", "RO": "ro", "MD": "ro", "HU": "hu", "FR": "fr", "BE": "nl", "LU": "fr", "MC": "fr", "DE": "de", "AT": "de", "CH": "de", "LI": "de", "IT": "it", "SM": "it", "RU": "ru", "BY": "ru", "KZ": "ru", "KG": "ru", "UA": "uk", "PL": "pl", "CZ": "cs", "NL": "nl", "ES": "es", "MX": "es", "AR": "es", "CO": "es", "PE": "es", "VE": "es", "CL": "es", "EC": "es", "GT": "es", "CU": "es", "BO": "es", "DO": "es", "HN": "es", "PY": "es", "SV": "es", "NI": "es", "CR": "es", "PA": "es", "UY": "es", "PR": "es", "GQ": "es", "RS": "sr", "SK": "sk", "MK": "mk", "TR": "tr", "HR": "sr", "BA": "sr", "ME": "sr"};

// Language code to write to a recipient in: their own app language, else the
// language of their country, else English.
export function mailLangFor(language: string | null | undefined, country: string | null | undefined): string {
  const lang = (language || "").toLowerCase().split("-")[0];
  if (COMPETITION_MAIL[lang]) return lang;
  const byCountry = COUNTRY_LANGUAGE[(country || "").toUpperCase()];
  if (byCountry && COMPETITION_MAIL[byCountry]) return byCountry;
  return "en";
}

export function mailTextFor(language: string | null | undefined, country: string | null | undefined): CompetitionMailText {
  return COMPETITION_MAIL[mailLangFor(language, country)];
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// v3.166 — texts of the standalone unsubscribe page (routes/auth.ts), same languages.
export interface UnsubscribePageText {
  title: string; confirm: string; button: string; doneTitle: string; done: string; app: string;
}

export const UNSUBSCRIBE_PAGE: Record<string, UnsubscribePageText> = {
  "bg": {
    "title": "Известия за състезания",
    "confirm": "Искате ли да спрете да получавате имейли и известия за новоорганизирани състезания? Можете да ги включите отново по всяко време от Профил → Известия за състезания.",
    "button": "Да, отпиши ме",
    "doneTitle": "Отписването е успешно",
    "done": "Няма да получавате повече имейли и известия за новоорганизирани състезания. Можете да ги включите отново по всяко време от Профил → Известия за състезания.",
    "app": "Към CatchCount"
  },
  "en": {
    "title": "Competition notifications",
    "confirm": "Do you want to stop receiving e-mails and notices about newly organized competitions? You can switch them back on at any time in Profile → Competition notifications.",
    "button": "Yes, unsubscribe me",
    "doneTitle": "You have been unsubscribed",
    "done": "You will no longer receive e-mails and notices about newly organized competitions. You can switch them back on at any time in Profile → Competition notifications.",
    "app": "Open CatchCount"
  },
  "cs": {
    "title": "Oznámení o soutěžích",
    "confirm": "Chcete přestat dostávat e-maily a oznámení o nově pořádaných soutěžích? Můžete je kdykoli znovu zapnout v Profil → Oznámení o soutěžích.",
    "button": "Ano, odhlásit",
    "doneTitle": "Odhlášení proběhlo",
    "done": "Už nebudete dostávat e-maily a oznámení o nově pořádaných soutěžích. Můžete je kdykoli znovu zapnout v Profil → Oznámení o soutěžích.",
    "app": "Otevřít CatchCount"
  },
  "de": {
    "title": "Wettbewerbs-Benachrichtigungen",
    "confirm": "Möchten Sie keine E-Mails und Hinweise zu neu veranstalteten Wettbewerben mehr erhalten? Sie können sie jederzeit unter Profil → Wettbewerbs-Benachrichtigungen wieder aktivieren.",
    "button": "Ja, abmelden",
    "doneTitle": "Abmeldung erfolgreich",
    "done": "Sie erhalten keine E-Mails und Hinweise zu neu veranstalteten Wettbewerben mehr. Sie können sie jederzeit unter Profil → Wettbewerbs-Benachrichtigungen wieder aktivieren.",
    "app": "CatchCount öffnen"
  },
  "es": {
    "title": "Notificaciones de competiciones",
    "confirm": "¿Quieres dejar de recibir correos y avisos sobre competiciones recién organizadas? Puedes volver a activarlos en cualquier momento en Perfil → Notificaciones de competiciones.",
    "button": "Sí, darme de baja",
    "doneTitle": "Baja realizada",
    "done": "Ya no recibirás correos ni avisos sobre competiciones recién organizadas. Puedes volver a activarlos en cualquier momento en Perfil → Notificaciones de competiciones.",
    "app": "Abrir CatchCount"
  },
  "fr": {
    "title": "Notifications de compétitions",
    "confirm": "Voulez-vous ne plus recevoir d'e-mails ni de notifications sur les compétitions nouvellement organisées ? Vous pouvez les réactiver à tout moment dans Profil → Notifications de compétitions.",
    "button": "Oui, me désinscrire",
    "doneTitle": "Désinscription effectuée",
    "done": "Vous ne recevrez plus d'e-mails ni de notifications sur les compétitions nouvellement organisées. Vous pouvez les réactiver à tout moment dans Profil → Notifications de compétitions.",
    "app": "Ouvrir CatchCount"
  },
  "hu": {
    "title": "Versenyértesítések",
    "confirm": "Szeretne leiratkozni az újonnan szervezett versenyekről szóló e-mailekről és értesítésekről? Bármikor visszakapcsolhatja őket a Profil → Versenyértesítések menüben.",
    "button": "Igen, leiratkozom",
    "doneTitle": "Sikeres leiratkozás",
    "done": "Többé nem kap e-mailt és értesítést az újonnan szervezett versenyekről. Bármikor visszakapcsolhatja őket a Profil → Versenyértesítések menüben.",
    "app": "CatchCount megnyitása"
  },
  "it": {
    "title": "Notifiche delle competizioni",
    "confirm": "Vuoi smettere di ricevere e-mail e avvisi sulle competizioni appena organizzate? Puoi riattivarli in qualsiasi momento da Profilo → Notifiche delle competizioni.",
    "button": "Sì, annulla l'iscrizione",
    "doneTitle": "Iscrizione annullata",
    "done": "Non riceverai più e-mail e avvisi sulle competizioni appena organizzate. Puoi riattivarli in qualsiasi momento da Profilo → Notifiche delle competizioni.",
    "app": "Apri CatchCount"
  },
  "mk": {
    "title": "Известувања за натпревари",
    "confirm": "Дали сакате да престанете да добивате е-пошта и известувања за новоорганизирани натпревари? Можете повторно да ги вклучите во секое време од Профил → Известувања за натпревари.",
    "button": "Да, отпиши ме",
    "doneTitle": "Успешно отпишување",
    "done": "Нема повеќе да добивате е-пошта и известувања за новоорганизирани натпревари. Можете повторно да ги вклучите во секое време од Профил → Известувања за натпревари.",
    "app": "Отвори CatchCount"
  },
  "nl": {
    "title": "Wedstrijdmeldingen",
    "confirm": "Wil je geen e-mails en meldingen over nieuw georganiseerde wedstrijden meer ontvangen? Je kunt ze op elk moment weer aanzetten via Profiel → Wedstrijdmeldingen.",
    "button": "Ja, afmelden",
    "doneTitle": "Afgemeld",
    "done": "Je ontvangt geen e-mails en meldingen over nieuw georganiseerde wedstrijden meer. Je kunt ze op elk moment weer aanzetten via Profiel → Wedstrijdmeldingen.",
    "app": "CatchCount openen"
  },
  "pl": {
    "title": "Powiadomienia o zawodach",
    "confirm": "Czy chcesz przestać otrzymywać e-maile i powiadomienia o nowo organizowanych zawodach? Możesz je w każdej chwili włączyć ponownie w Profil → Powiadomienia o zawodach.",
    "button": "Tak, wypisz mnie",
    "doneTitle": "Wypisano pomyślnie",
    "done": "Nie będziesz już otrzymywać e-maili ani powiadomień o nowo organizowanych zawodach. Możesz je w każdej chwili włączyć ponownie w Profil → Powiadomienia o zawodach.",
    "app": "Otwórz CatchCount"
  },
  "ro": {
    "title": "Notificări despre competiții",
    "confirm": "Vrei să nu mai primești e-mailuri și notificări despre competițiile nou organizate? Le poți reactiva oricând din Profil → Notificări despre competiții.",
    "button": "Da, dezabonează-mă",
    "doneTitle": "Dezabonare reușită",
    "done": "Nu vei mai primi e-mailuri și notificări despre competițiile nou organizate. Le poți reactiva oricând din Profil → Notificări despre competiții.",
    "app": "Deschide CatchCount"
  },
  "ru": {
    "title": "Уведомления о соревнованиях",
    "confirm": "Хотите перестать получать письма и уведомления о новых соревнованиях? Вы можете снова включить их в любое время в разделе Профиль → Уведомления о соревнованиях.",
    "button": "Да, отписаться",
    "doneTitle": "Вы отписались",
    "done": "Вы больше не будете получать письма и уведомления о новых соревнованиях. Вы можете снова включить их в любое время в разделе Профиль → Уведомления о соревнованиях.",
    "app": "Открыть CatchCount"
  },
  "sk": {
    "title": "Oznámenia o súťažiach",
    "confirm": "Chcete prestať dostávať e-maily a oznámenia o novo organizovaných súťažiach? Môžete ich kedykoľvek znova zapnúť v Profil → Oznámenia o súťažiach.",
    "button": "Áno, odhlásiť",
    "doneTitle": "Odhlásenie prebehlo",
    "done": "Už nebudete dostávať e-maily a oznámenia o novo organizovaných súťažiach. Môžete ich kedykoľvek znova zapnúť v Profil → Oznámenia o súťažiach.",
    "app": "Otvoriť CatchCount"
  },
  "sr": {
    "title": "Obaveštenja o takmičenjima",
    "confirm": "Želite li da prestanete da primate e-poštu i obaveštenja o novoorganizovanim takmičenjima? Možete ih ponovo uključiti u bilo kom trenutku u Profil → Obaveštenja o takmičenjima.",
    "button": "Da, odjavi me",
    "doneTitle": "Odjava uspešna",
    "done": "Više nećete primati e-poštu i obaveštenja o novoorganizovanim takmičenjima. Možete ih ponovo uključiti u bilo kom trenutku u Profil → Obaveštenja o takmičenjima.",
    "app": "Otvori CatchCount"
  },
  "tr": {
    "title": "Yarışma bildirimleri",
    "confirm": "Yeni düzenlenen yarışmalarla ilgili e-posta ve bildirimleri almayı durdurmak istiyor musunuz? Bunları istediğiniz zaman Profil → Yarışma bildirimleri bölümünden tekrar açabilirsiniz.",
    "button": "Evet, aboneliğimi bitir",
    "doneTitle": "Abonelik sonlandırıldı",
    "done": "Yeni düzenlenen yarışmalarla ilgili e-posta ve bildirim almayacaksınız. Bunları istediğiniz zaman Profil → Yarışma bildirimleri bölümünden tekrar açabilirsiniz.",
    "app": "CatchCount'ı aç"
  },
  "uk": {
    "title": "Сповіщення про змагання",
    "confirm": "Хочете припинити отримувати листи та сповіщення про нові змагання? Ви можете знову ввімкнути їх будь-коли в розділі Профіль → Сповіщення про змагання.",
    "button": "Так, відписатися",
    "doneTitle": "Ви відписалися",
    "done": "Ви більше не отримуватимете листи та сповіщення про нові змагання. Ви можете знову ввімкнути їх будь-коли в розділі Профіль → Сповіщення про змагання.",
    "app": "Відкрити CatchCount"
  }
};

export function unsubscribePageText(language: string | null | undefined): UnsubscribePageText {
  const lang = (language || "").toLowerCase().split("-")[0];
  return UNSUBSCRIBE_PAGE[lang] || UNSUBSCRIBE_PAGE.en;
}
