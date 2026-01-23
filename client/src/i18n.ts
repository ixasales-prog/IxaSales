/**
 * Internationalization (i18n) Module
 * 
 * Multi-language support for the Customer Portal.
 * Supports: Uzbek (uz), Russian (ru), English (en)
 */

import { createSignal } from 'solid-js';

// ============================================================================
// TRANSLATIONS
// ============================================================================

export const translations = {
    uz: {
        login: {
            title: 'Mijoz Kabineti',
            subtitle: "Buyurtmalaringizni ko'ring",
            phoneLabel: 'Telefon raqamingiz',
            phonePlaceholder: '+998 90 123 45 67',
            otpLabel: 'Tasdiqlash kodi',
            otpPlaceholder: '123456',
            otpSent: 'Kod {phone} ga yuborildi',
            submit: 'Davom etish',
            verify: 'Tasdiqlash',
            back: 'Orqaga',
            sending: 'Yuborilmoqda...',
            checking: 'Tekshirilmoqda...',
            errors: {
                tenantNotFound: 'Kompaniya topilmadi',
                customerNotFound: 'Bu telefon raqami topilmadi',
                invalidOtp: "Noto'g'ri kod",
                otpExpired: 'Kod muddati tugagan',
                noTelegram: 'Telegram ulangan emas',
                rateLimited: "Ko'p urinish. Keyinroq qaytadan urining"
            }
        },
        dashboard: {
            hello: 'Salom, {name}!',
            update: 'Yangilash',
            logout: 'Chiqish',
            offline: "Internet aloqasi yo'q. Ilova offline rejimda ishlamoqda.",
            debt: 'Qarz:',
            loading: 'Yuklanmoqda...'
        },
        tabs: {
            orders: 'Buyurtmalar',
            catalog: 'Katalog',
            favorites: 'Saralanganlar',
            payments: "To'lovlar",
            profile: 'Profil'
        },
        orders: {
            filter: 'Filtr',
            ordersCount: 'buyurtma',
            debt: 'Qarz',
            filters: {
                all: 'Barchasi',
                pending: 'Kutilmoqda',
                delivering: 'Yetkazilmoqda',
                delivered: 'Yetkazildi',
                cancelled: 'Bekor qilindi'
            },
            empty: 'Buyurtmalar topilmadi',
            number: '#{number}',
            reorder: 'Qayta buyurtma',
            cancel: 'Bekor qilish',
            loadMore: "Ko'proq yuklash",
            status: {
                pending: 'Kutilmoqda',
                confirmed: 'Tasdiqlangan',
                approved: 'Tayyorlanmoqda',
                delivering: 'Yetkazilmoqda',
                delivered: 'Yetkazildi',
                cancelled: 'Bekor qilindi',
                returned: 'Qaytarildi'
            },
            paymentStatus: {
                unpaid: "To'lanmagan",
                partial: 'Qisman',
                paid: "To'langan"
            }
        },
        products: {
            search: 'Mahsulot qidirish...',
            allCategories: 'Barcha kategoriyalar',
            empty: 'Mahsulotlar topilmadi',
            view: "Ko'rish",
            inStock: 'Mavjud: {qty} dona',
            outOfStock: 'Mavjud emas',
            lowStock: 'Faqat {qty} ta qoldi!',
            addToCart: "Savatga qo'shish",
            sort: {
                label: 'Saralash',
                default: 'Standart',
                priceAsc: 'Narx: arzondan qimmatga',
                priceDesc: 'Narx: qimmatdan arzonga',
                nameAsc: 'Nomi: A-Z',
                nameDesc: 'Nomi: Z-A',
                newest: 'Eng yangi'
            },
            recentSearches: 'Oxirgi qidiruvlar',
            clearHistory: 'Tozalash'
        },
        reviews: {
            title: 'Sharhlar',
            writeReview: 'Sharh yozish',
            yourRating: 'Sizning bahoyingiz',
            commentPlaceholder: 'Mahsulot haqida fikringiz...',
            submit: 'Yuborish',
            noReviews: 'Sharhlar hali yo\'q',
            reviewCount: 'ta sharh'
        },
        cart: {
            title: 'Savat ({count})',
            empty: "Savat bo'sh",
            emptyDescription: "Katalogdan mahsulotlar qo'shing",
            browseProducts: 'Katalogga o\'tish',
            total: 'Jami:',
            subtotal: 'Jami summa:',
            discount: 'Chegirma:',
            lineTotal: '{qty} × {price}',
            notes: 'Izoh (ixtiyoriy)',
            deliveryAddress: 'Yetkazib berish manzili',
            selectAddress: 'Manzilni tanlang...',
            otherAddress: 'Boshqa manzil...',
            enterAddress: 'Manzilni kiriting...',
            checkout: 'Buyurtma berish',
            processing: 'Yuborilmoqda...',
            success: 'Buyurtma muvaffaqiyatli yaratildi',
            error: 'Xatolik yuz berdi',
            discountCode: 'Chegirma kodi',
            applyDiscount: 'Qo\'llash',
            discountApplied: 'Chegirma qo\'llanildi!',
            invalidDiscount: 'Noto\'g\'ri chegirma kodi',
            removeDiscount: 'Chegirmani olib tashlash',
            addressRequired: 'Yetkazib berish manzilini kiriting',
            autoDiscountHint: 'Avtomatik chegirma qo\'llaniladi',
            checkingDiscounts: 'Chegirmalar tekshirilmoqda...'
        },
        payments: {
            totalPaid: "Jami to'langan:",
            empty: "To'lovlar topilmadi",
            emptyDescription: "Buyurtmalar uchun to'lovlar shu yerda ko'rinadi"
        },
        profile: {
            name: 'Ism',
            phone: 'Telefon',
            email: 'Email',
            address: 'Manzil',
            addresses: 'Manzillar',
            noAddresses: 'Manzillar mavjud emas',
            addAddress: "Manzil qo'shish",
            editAddress: 'Manzilni tahrirlash',
            default: 'Asosiy',
            setAsDefault: 'Asosiy qilish',
            edit: 'Tahrirlash',
            save: 'Saqlash',
            cancel: 'Bekor qilish',
            profileUpdated: 'Profil yangilandi',
            addressAdded: 'Manzil qo\'shildi',
            addressUpdated: 'Manzil yangilandi',
            addressDeleted: 'Manzil o\'chirildi',
            defaultChanged: 'Asosiy manzil o\'zgartirildi',
            support: 'Aloqa',
            noContact: 'Aloqa ma\'lumotlari mavjud emas',
            stats: {
                orders: 'Buyurtmalar',
                payments: "To'lovlar"
            }
        },
        favorites: {
            empty: "Saralangan mahsulotlar yo'q",
            emptyDescription: 'Mahsulotlardagi ❤️ belgisini bosing',
            browseProducts: 'Katalogga o\'tish'
        },
        modals: {
            cancelOrder: 'Buyurtmani bekor qilishni xohlaysizmi?',
            deleteAddress: 'Manzilni o\'chirish?',
            logout: 'Chiqishni xohlaysizmi?',
            addressName: 'Nomi (masalan: Uy, Ofis)',
            fullAddress: "To'liq manzil",
            setAsDefault: 'Asosiy qilib belgilash',
            addressNamePlaceholder: 'Uy, Ofis...',
            addressPlaceholder: 'Shahar, ko\'cha, uy...'
        },
        orderConfirmation: {
            title: 'Buyurtma qabul qilindi!',
            orderNumber: 'Buyurtma raqami',
            items: '{count} ta mahsulot',
            total: 'Jami summa',
            estimatedDelivery: 'Taxminiy yetkazish',
            today: 'Bugun',
            tomorrow: 'Ertaga',
            days: '{days} kun ichida',
            trackOrder: 'Buyurtmani kuzatish',
            continueShopping: 'Xaridni davom ettirish',
            shareOrder: 'Ulashish',
            thankYou: 'Xaridingiz uchun rahmat!',
            notification: 'Buyurtma holati o\'zgarganda sizga xabar beramiz'
        },
        errors: {
            generic: 'Xatolik yuz berdi',
            network: 'Internet aloqasi yo\'q',
            tryAgain: 'Qaytadan urinib ko\'ring',
            sessionExpired: 'Sessiya tugadi, qayta kiring',
            unauthorized: 'Tizimga kirish talab qilinadi',
            notFound: 'Topilmadi',
            validation: 'Ma\'lumotlar noto\'g\'ri',
            serverError: 'Server xatosi'
        },
        actions: {
            retry: 'Qaytadan',
            close: 'Yopish',
            confirm: 'Tasdiqlash',
            delete: 'O\'chirish',
            share: 'Ulashish',
            copy: 'Nusxalash'
        },
        theme: {
            light: 'Yorug\' rejim',
            dark: 'Tungi rejim',
            system: 'Sistema'
        },
        orderDetail: {
            title: 'Buyurtma',
            orderStatus: 'Buyurtma holati',
            unpaidAmount: 'To\'lanmagan summa',
            pay: 'To\'lash',
            fullyPaid: 'To\'liq to\'langan',
            products: 'Mahsulotlar',
            summary: 'Jami',
            subtotal: 'Summa',
            discount: 'Chegirma',
            total: 'Jami',
            paid: 'To\'langan',
            remaining: 'Qoldiq',
            notes: 'Izoh',
            loading: 'Yuklanmoqda...',
            notFound: 'Buyurtma topilmadi',
            back: 'Orqaga'
        },
        paymentPortal: {
            title: 'To\'lov',
            loading: 'Yuklanmoqda...',
            error: 'Xatolik',
            tokenNotFound: 'Token topilmadi',
            paymentNotFound: 'To\'lov ma\'lumotlari topilmadi',
            genericError: 'Xatolik yuz berdi. Qayta urunib ko\'ring.',
            backToHome: 'Bosh sahifaga qaytish',
            paymentSuccess: 'To\'lov muvaffaqiyatli!',
            order: 'Buyurtma',
            amount: 'Summa',
            thankYou: 'Xaridingiz uchun rahmat! 🙏',
            expired: 'Muddat tugadi',
            expiredMessage: 'Ushbu to\'lov havolasi muddati tugagan.',
            contactSeller: 'Yangi havola olish uchun sotuvchiga murojaat qiling.',
            cancelled: 'To\'lov bekor qilindi',
            cancelledMessage: 'Ushbu to\'lov bekor qilingan.',
            customer: 'Mijoz',
            paymentAmount: 'To\'lov summasi',
            selectPaymentMethod: 'To\'lov usulini tanlang:',
            payWithClick: 'Click orqali to\'lash',
            payWithPayme: 'Payme orqali to\'lash',
            noPaymentMethods: 'To\'lov usullari sozlanmagan. Sotuvchiga murojaat qiling.',
            securePayment: '🔒 Barcha to\'lovlar xavfsiz',
            poweredBy: 'IxaSales tomonidan ta\'minlangan'
        },
        salesApp: {
            nav: {
                home: 'Bosh sahifa',
                catalog: 'Katalog',
                orders: 'Buyurtmalar',
                customers: 'Mijozlar',
                menu: 'Menyu'
            },
            dashboard: {
                greeting: 'Xayrli {timeOfDay}, {name}!',
                morning: 'tong',
                afternoon: 'kun',
                evening: 'kech',
                todaysSales: 'Bugungi savdo',
                pendingOrders: 'Kutilayotgan',
                myCustomers: 'Mening mijozlarim',
                recentOrders: 'So\'nggi buyurtmalar',
                viewAll: 'Barchasini ko\'rish',
                noCustomers: 'Mijozlar biriktirilmagan',
                noOrders: 'Bugun buyurtmalar yo\'q',
                quickActions: 'Tezkor harakatlar',
                newOrder: 'Yangi buyurtma',
                addCustomer: 'Mijoz qo\'shish'
            },
            catalog: {
                search: 'Mahsulot qidirish...',
                all: 'Barchasi',
                allBrands: 'Barcha brendlar',
                brand: 'Brend',
                clearFilters: 'Filtrlarni tozalash',
                noProducts: 'Mahsulotlar topilmadi',
                adjustSearch: 'Qidiruvni o\'zgartiring',
                productsAppear: 'Mahsulotlar qo\'shilganda ko\'rinadi',
                outOfStock: 'Mavjud emas',
                items: 'dona'
            },
            cart: {
                title: 'Savat',
                items: 'dona',
                clearAll: 'Tozalash',
                empty: 'Savat bo\'sh',
                addProducts: 'Buyurtma uchun mahsulot qo\'shing',
                browseCatalog: 'Katalogga o\'tish',
                selectCustomer: 'Mijozni tanlang',
                tapToChange: 'O\'zgartirish uchun bosing',
                required: 'Majburiy',
                requiredForOrder: 'Buyurtma uchun talab qilinadi',
                subtotal: 'Jami',
                total: 'Umumiy',
                submitOrder: 'Buyurtma berish',
                submitting: 'Yuborilmoqda...',
                orderSubmitted: 'Buyurtma qabul qilindi!',
                redirecting: 'Bosh sahifaga o\'tilmoqda...',
                selectCustomerFirst: 'Avval mijozni tanlang',
                cartEmpty: 'Savat bo\'sh',
                searchCustomers: 'Mijozni qidirish...',
                loadingCustomers: 'Mijozlar yuklanmoqda...',
                noCustomersFound: 'Mijozlar topilmadi',
                new: 'Yangi'
            },
            orders: {
                title: 'Mening buyurtmalarim',
                orders: 'buyurtma',
                search: 'Buyurtma raqami...',
                all: 'Barchasi',
                pending: 'Kutilayotgan',
                delivered: 'Yetkazildi',
                returned: 'Qaytarildi',
                paid: 'To\'langan',
                loading: 'Yuklanmoqda...',
                noOrders: 'Buyurtmalar topilmadi',
                createOrder: 'Buyurtma yaratish',
                orderDetails: 'Buyurtma tafsilotlari',
                status: 'Holat',
                products: 'Mahsulotlar',
                notes: 'Izohlar',
                close: 'Yopish',
                each: 'dona'
            },
            customers: {
                title: 'Mijozlar',
                search: 'Mijozni qidirish...',
                noCustomers: 'Mijozlar topilmadi',
                adjustSearch: 'Qidiruvni o\'zgartiring',
                customersAppear: 'Mijozlar qo\'shilganda ko\'rinadi',
                clear: 'Qarz yo\'q',
                limitReached: 'Limit tugadi',
                hasBalance: 'Qarz bor',
                unknown: 'Noma\'lum',
                details: 'Mijoz tafsilotlari',
                phone: 'Telefon',
                address: 'Manzil',
                creditInfo: 'Kredit ma\'lumotlari',
                creditLimit: 'Kredit limiti',
                currentDebt: 'Joriy qarz',
                noBalance: 'Qarzdorlik yo\'q',
                creditLimitReached: 'Kredit limiti tugadi',
                hasOutstanding: 'Qarzdorlik mavjud',
                createOrder: 'Buyurtma yaratish'
            },
            menu: {
                title: 'Menyu',
                account: 'Hisob',
                support: 'Yordam',
                profile: 'Profil',
                notifications: 'Bildirishnomalar',
                settings: 'Sozlamalar',
                help: 'Yordam va qo\'llab-quvvatlash',
                privacy: 'Maxfiylik va xavfsizlik',
                language: 'Til',
                signOut: 'Chiqish',
                forSales: 'Savdo uchun',
                version: 'Versiya'
            },
            addCustomer: {
                title: 'Yangi mijoz',
                businessName: 'Biznes nomi',
                phone: 'Telefon',
                email: 'Email',
                address: 'Manzil',
                territory: 'Hudud',
                waymark: 'Mo\'ljal',
                notes: 'Izohlar',
                enterName: 'Biznes nomini kiriting',
                phoneNumber: 'Telefon raqami',
                emailAddress: 'Email manzili',
                fullAddress: 'To\'liq manzil',
                selectTerritory: 'Hududni tanlang...',
                waymarkPlaceholder: 'Masalan: masjid yonida, bank qarshisida',
                waymarkHint: 'Mijozni topishga yordam beradigan mo\'ljal',
                additionalNotes: 'Qo\'shimcha izohlar...',
                useLocation: 'Joriy joylashuvdan foydalanish',
                cancel: 'Bekor qilish',
                save: 'Saqlash',
                required: 'Majburiy maydon',
                fillRequired: 'Barcha majburiy maydonlarni to\'ldiring',
                geoNotSupported: 'Brauzeringiz joylashuvni qo\'llab-quvvatlamaydi',
                addressFromLocation: 'Manzil joylashuv orqali yangilandi',
                geoFailed: 'Koordinatalardan manzil olib bo\'lmadi',
                permissionDenied: 'Joylashuv ruxsati rad etildi',
                positionUnavailable: 'Joylashuv ma\'lumoti mavjud emas',
                timeout: 'Joylashuv so\'rovi vaqti tugadi',
                unknownGeoError: 'Noma\'lum xato yuz berdi',
                customerCreated: 'Mijoz muvaffaqiyatli yaratildi',
                createFailed: 'Mijoz yaratishda xato'
            },
            productDetail: {
                details: 'Tafsilotlar',
                outOfStock: 'Mavjud emas',
                inStock: 'mavjud',
                per: 'uchun',
                description: 'Tavsif',
                inCart: 'savatda',
                addToCart: 'Savatga qo\'shish'
            },
            common: {
                loading: 'Yuklanmoqda...',
                error: 'Xato',
                retry: 'Qayta urinish',
                cancel: 'Bekor qilish',
                save: 'Saqlash',
                close: 'Yopish',
                confirm: 'Tasdiqlash',
                delete: 'O\'chirish'
            },
            visits: {
                title: 'Tashriflar',
                today: 'Bugun',
                total: 'jami',
                planned: 'Rejalashtirilgan',
                inProgress: 'Jarayonda',
                completed: 'Bajarilgan',
                cancelled: 'Bekor qilingan',
                noVisits: 'Tashriflar yo\'q',
                noVisitsDesc: 'Bugun uchun rejalashtirilgan tashriflar yo\'q',
                start: 'Boshlash',
                complete: 'Tugatish',
                orderPlaced: 'Buyurtma berildi',
                visitStarted: 'Tashrif boshlandi',
                startFailed: 'Tashrifni boshlashda xato',
                visitCompleted: 'Tashrif tugallandi',
                completeFailed: 'Tashrifni tugatishda xato',
                completeVisit: 'Tashrifni tugatish',
                outcomeOrderPlaced: 'Buyurtma berildi',
                outcomeNoOrder: 'Buyurtma yo\'q',
                outcomeFollowUp: 'Keyinroq aloqa',
                outcomeNotAvailable: 'Mijoz yo\'q',
                notesPlaceholder: 'Izohlar...',
                createOrder: 'Buyurtma yaratish',
                finish: 'Tugatish',
                scheduleTitle: 'Tashrifni rejalashtirish',
                schedulingFor: 'Mijoz',
                date: 'Sana',
                time: 'Vaqt',
                notes: 'Izohlar',
                scheduleSuccess: 'Tashrif rejalashtirildi',
                scheduleFailed: 'Xatolik yuz berdi',
                history: 'Tarix',
                allVisits: 'Barcha tashriflar',
                missed: 'O\'tkazib yuborilgan',
                photos: 'Rasmlar',
                previousDay: 'Oldingi kun',
                nextDay: 'Keyingi kun',
                callCustomer: 'Mijozga qo\'ng\'iroq qilish',
                addPhoto: 'Rasm qo\'shish',
                removePhoto: 'Rasmni o\'chirish'
            },
            customerDetail: {
                title: 'Mijoz tafsilotlari',
                phone: 'Telefon',
                address: 'Manzil',
                creditInfo: 'Kredit ma\'lumotlari',
                creditLimit: 'Kredit limiti',
                currentDebt: 'Joriy qarz',
                noBalance: 'Qarzdorlik yo\'q',
                creditLimitReached: 'Kredit limiti tugadi',
                hasBalance: 'Qarzdorlik mavjud',
                createOrder: 'Buyurtma yaratish',
                scheduleVisit: 'Tashrifni rejalashtirish',
                close: 'Yopish'
            },
            quickVisit: {
                title: 'Tez tashrif',
                searchCustomer: 'Mijozni qidirish...',
                noCustomers: 'Mijozlar topilmadi',
                takePhoto: 'Rasm oling',
                tapToCapture: 'Rasmga olish uchun bosing',
                uploading: 'Yuklanmoqda...',
                photoUploadFailed: 'Rasm yuklanmadi',
                skip: 'O\'tkazib yuborish',
                next: 'Keyingisi',
                visitTo: 'Tashrif:',
                whatHappened: 'Natija qanday bo\'ldi?',
                orderPlaced: 'Buyurtma berildi',
                orderPlacedDesc: 'Katalogga o\'tish va buyurtma berish',
                noOrder: 'Buyurtma yo\'q',
                noOrderDesc: 'Sababni tanlang',
                followUp: 'Keyinroq aloqa',
                followUpDesc: 'Eslatma qo\'yish',
                whyNoOrder: 'Nima uchun buyurtma bo\'lmadi?',
                selectReason: 'Sababni tanlang',
                enterReason: 'Sababni kiriting...',
                complete: 'Tugatish',
                scheduleFollowUp: 'Eslatma qo\'yish',
                reason: 'Sabab',
                date: 'Sana',
                time: 'Vaqt',
                noteOptional: 'Izoh (ixtiyoriy)...',
                schedule: 'Saqlash',
                visitCompleted: 'Tashrif saqlandi!',
                visitFailed: 'Xatolik yuz berdi',
                reasons: {
                    closed: 'Do\'kon yopiq',
                    has_stock: 'Tovar yetarli',
                    high_price: 'Narx yuqori',
                    competitor: 'Raqobatchi tanladi',
                    no_budget: 'Pul yetarli emas',
                    payment_issue: 'To\'lov muammosi',
                    quality_issue: 'Sifat muammosi',
                    not_interested: 'Qiziqmadi',
                    other: 'Boshqa'
                },
                followUpReasons: {
                    owner_absent: 'Egasi yo\'q',
                    decision_pending: 'Qaror kutilmoqda',
                    busy_now: 'Hozir band',
                    callback_requested: 'Qayta aloqa so\'radi',
                    delivery_awaited: 'Yetkazib berishni kutadi',
                    other: 'Boshqa'
                }
            }
        }
    },

    ru: {
        login: {
            title: 'Личный кабинет',
            subtitle: 'Просмотр ваших заказов',
            phoneLabel: 'Номер телефона',
            phonePlaceholder: '+998 90 123 45 67',
            otpLabel: 'Код подтверждения',
            otpPlaceholder: '123456',
            otpSent: 'Код отправлен на {phone}',
            submit: 'Продолжить',
            verify: 'Подтвердить',
            back: 'Назад',
            sending: 'Отправка...',
            checking: 'Проверка...',
            errors: {
                tenantNotFound: 'Компания не найдена',
                customerNotFound: 'Номер телефона не найден',
                invalidOtp: 'Неверный код',
                otpExpired: 'Код истёк',
                noTelegram: 'Telegram не подключён',
                rateLimited: 'Слишком много попыток. Попробуйте позже'
            }
        },
        dashboard: {
            hello: 'Привет, {name}!',
            update: 'Обновить',
            logout: 'Выйти',
            offline: 'Нет подключения к интернету. Приложение работает офлайн.',
            debt: 'Долг:',
            loading: 'Загрузка...'
        },
        tabs: {
            orders: 'Заказы',
            catalog: 'Каталог',
            favorites: 'Избранное',
            payments: 'Платежи',
            profile: 'Профиль'
        },
        orders: {
            filter: 'Фильтр',
            ordersCount: 'заказ(ов)',
            debt: 'Долг',
            filters: {
                all: 'Все',
                pending: 'Ожидает',
                delivering: 'Доставляется',
                delivered: 'Доставлено',
                cancelled: 'Отменён'
            },
            empty: 'Заказы не найдены',
            number: '#{number}',
            reorder: 'Повторить',
            cancel: 'Отменить',
            loadMore: 'Загрузить ещё',
            status: {
                pending: 'Ожидает',
                confirmed: 'Подтверждён',
                approved: 'Подготовка',
                delivering: 'Доставляется',
                delivered: 'Доставлено',
                cancelled: 'Отменён',
                returned: 'Возврат'
            },
            paymentStatus: {
                unpaid: 'Не оплачено',
                partial: 'Частично',
                paid: 'Оплачено'
            }
        },
        products: {
            search: 'Поиск товаров...',
            allCategories: 'Все категории',
            empty: 'Товары не найдены',
            view: 'Смотреть',
            inStock: 'В наличии: {qty} шт',
            outOfStock: 'Нет в наличии',
            lowStock: 'Осталось {qty} шт!',
            addToCart: 'В корзину',
            sort: {
                label: 'Сортировка',
                default: 'По умолчанию',
                priceAsc: 'Цена: по возрастанию',
                priceDesc: 'Цена: по убыванию',
                nameAsc: 'Название: А-Я',
                nameDesc: 'Название: Я-А',
                newest: 'Новинки'
            },
            recentSearches: 'Недавние поиски',
            clearHistory: 'Очистить'
        },
        reviews: {
            title: 'Отзывы',
            writeReview: 'Написать отзыв',
            yourRating: 'Ваша оценка',
            commentPlaceholder: 'Ваше мнение о товаре...',
            submit: 'Отправить',
            noReviews: 'Отзывов пока нет',
            reviewCount: 'отзыв(ов)'
        },
        cart: {
            title: 'Корзина ({count})',
            empty: 'Корзина пуста',
            emptyDescription: 'Добавьте товары из каталога',
            browseProducts: 'Перейти в каталог',
            total: 'Итого:',
            subtotal: 'Сумма:',
            discount: 'Скидка:',
            lineTotal: '{qty} × {price}',
            notes: 'Комментарий (необязательно)',
            deliveryAddress: 'Адрес доставки',
            selectAddress: 'Выберите адрес...',
            otherAddress: 'Другой адрес...',
            enterAddress: 'Введите адрес...',
            checkout: 'Оформить заказ',
            processing: 'Отправка...',
            success: 'Заказ успешно создан',
            error: 'Произошла ошибка',
            discountCode: 'Промокод',
            applyDiscount: 'Применить',
            discountApplied: 'Скидка применена!',
            invalidDiscount: 'Неверный промокод',
            removeDiscount: 'Убрать скидку',
            addressRequired: 'Укажите адрес доставки',
            autoDiscountHint: 'Автоматическая скидка будет применена',
            checkingDiscounts: 'Проверка скидок...'
        },
        payments: {
            totalPaid: 'Всего оплачено:',
            empty: 'Платежей нет',
            emptyDescription: 'Здесь будут отображаться платежи по заказам'
        },
        profile: {
            name: 'Имя',
            phone: 'Телефон',
            email: 'Email',
            address: 'Адрес',
            addresses: 'Адреса',
            noAddresses: 'Адресов нет',
            addAddress: 'Добавить адрес',
            editAddress: 'Редактировать адрес',
            default: 'Основной',
            setAsDefault: 'Сделать основным',
            edit: 'Редактировать',
            save: 'Сохранить',
            cancel: 'Отмена',
            profileUpdated: 'Профиль обновлён',
            addressAdded: 'Адрес добавлен',
            addressUpdated: 'Адрес обновлён',
            addressDeleted: 'Адрес удалён',
            defaultChanged: 'Основной адрес изменён',
            support: 'Поддержка',
            noContact: 'Контактная информация недоступна',
            stats: {
                orders: 'Заказы',
                payments: 'Платежи'
            }
        },
        favorites: {
            empty: 'Нет избранных товаров',
            emptyDescription: 'Нажмите ❤️ на товаре',
            browseProducts: 'Перейти в каталог'
        },
        modals: {
            cancelOrder: 'Отменить заказ?',
            deleteAddress: 'Удалить адрес?',
            logout: 'Выйти из аккаунта?',
            addressName: 'Название (напр.: Дом, Офис)',
            fullAddress: 'Полный адрес',
            setAsDefault: 'Сделать основным',
            addressNamePlaceholder: 'Дом, Офис...',
            addressPlaceholder: 'Город, улица, дом...'
        },
        orderConfirmation: {
            title: 'Заказ принят!',
            orderNumber: 'Номер заказа',
            items: '{count} товар(ов)',
            total: 'Сумма заказа',
            estimatedDelivery: 'Ожидаемая доставка',
            today: 'Сегодня',
            tomorrow: 'Завтра',
            days: 'Через {days} дней',
            trackOrder: 'Отследить заказ',
            continueShopping: 'Продолжить покупки',
            shareOrder: 'Поделиться',
            thankYou: 'Спасибо за покупку!',
            notification: 'Мы уведомим вас об изменении статуса заказа'
        },
        errors: {
            generic: 'Произошла ошибка',
            network: 'Нет подключения к интернету',
            tryAgain: 'Попробуйте снова',
            sessionExpired: 'Сессия истекла, войдите заново',
            unauthorized: 'Требуется авторизация',
            notFound: 'Не найдено',
            validation: 'Неверные данные',
            serverError: 'Ошибка сервера'
        },
        actions: {
            retry: 'Повторить',
            close: 'Закрыть',
            confirm: 'Подтвердить',
            delete: 'Удалить',
            share: 'Поделиться',
            copy: 'Копировать'
        },
        theme: {
            light: 'Светлая тема',
            dark: 'Тёмная тема',
            system: 'Системная'
        },
        orderDetail: {
            title: 'Заказ',
            orderStatus: 'Статус заказа',
            unpaidAmount: 'К оплате',
            pay: 'Оплатить',
            fullyPaid: 'Полностью оплачено',
            products: 'Товары',
            summary: 'Итого',
            subtotal: 'Сумма',
            discount: 'Скидка',
            total: 'Итого',
            paid: 'Оплачено',
            remaining: 'Остаток',
            notes: 'Примечание',
            loading: 'Загрузка...',
            notFound: 'Заказ не найден',
            back: 'Назад'
        },
        paymentPortal: {
            title: 'Оплата',
            loading: 'Загрузка...',
            error: 'Ошибка',
            tokenNotFound: 'Токен не найден',
            paymentNotFound: 'Информация об оплате не найдена',
            genericError: 'Произошла ошибка. Попробуйте снова.',
            backToHome: 'Вернуться на главную',
            paymentSuccess: 'Оплата успешна!',
            order: 'Заказ',
            amount: 'Сумма',
            thankYou: 'Спасибо за покупку! 🙏',
            expired: 'Срок истёк',
            expiredMessage: 'Срок действия ссылки истёк.',
            contactSeller: 'Свяжитесь с продавцом для получения новой ссылки.',
            cancelled: 'Оплата отменена',
            cancelledMessage: 'Эта оплата была отменена.',
            customer: 'Клиент',
            paymentAmount: 'Сумма оплаты',
            selectPaymentMethod: 'Выберите способ оплаты:',
            payWithClick: 'Оплатить через Click',
            payWithPayme: 'Оплатить через Payme',
            noPaymentMethods: 'Способы оплаты не настроены. Свяжитесь с продавцом.',
            securePayment: '🔒 Все платежи защищены',
            poweredBy: 'Работает на IxaSales'
        },
        salesApp: {
            nav: {
                home: 'Главная',
                catalog: 'Каталог',
                orders: 'Заказы',
                customers: 'Клиенты',
                menu: 'Меню'
            },
            dashboard: {
                greeting: 'Доброе {timeOfDay}, {name}!',
                morning: 'утро',
                afternoon: 'день',
                evening: 'вечер',
                todaysSales: 'Продажи за сегодня',
                pendingOrders: 'Ожидающие',
                myCustomers: 'Мои клиенты',
                recentOrders: 'Последние заказы',
                viewAll: 'Смотреть все',
                noCustomers: 'Клиенты не назначены',
                noOrders: 'Сегодня заказов нет',
                quickActions: 'Быстрые действия',
                newOrder: 'Новый заказ',
                addCustomer: 'Добавить клиента'
            },
            catalog: {
                search: 'Поиск товаров...',
                all: 'Все',
                allBrands: 'Все бренды',
                brand: 'Бренд',
                clearFilters: 'Сбросить фильтры',
                noProducts: 'Товары не найдены',
                adjustSearch: 'Попробуйте изменить поиск',
                productsAppear: 'Товары появятся после добавления',
                outOfStock: 'Нет в наличии',
                items: 'шт'
            },
            cart: {
                title: 'Корзина',
                items: 'шт',
                clearAll: 'Очистить',
                empty: 'Корзина пуста',
                addProducts: 'Добавьте товары для заказа',
                browseCatalog: 'Перейти в каталог',
                selectCustomer: 'Выберите клиента',
                tapToChange: 'Нажмите для изменения',
                required: 'Обязательно',
                requiredForOrder: 'Требуется для заказа',
                subtotal: 'Сумма',
                total: 'Итого',
                submitOrder: 'Оформить заказ',
                submitting: 'Отправка...',
                orderSubmitted: 'Заказ принят!',
                redirecting: 'Переход на главную...',
                selectCustomerFirst: 'Сначала выберите клиента',
                cartEmpty: 'Корзина пуста',
                searchCustomers: 'Поиск клиента...',
                loadingCustomers: 'Загрузка клиентов...',
                noCustomersFound: 'Клиенты не найдены',
                new: 'Новый'
            },
            orders: {
                title: 'Мои заказы',
                orders: 'заказ(ов)',
                search: 'Номер заказа...',
                all: 'Все',
                pending: 'Ожидающие',
                delivered: 'Доставлено',
                returned: 'Возврат',
                paid: 'Оплачено',
                loading: 'Загрузка...',
                noOrders: 'Заказы не найдены',
                createOrder: 'Создать заказ',
                orderDetails: 'Детали заказа',
                status: 'Статус',
                products: 'Товары',
                notes: 'Примечания',
                close: 'Закрыть',
                each: 'шт'
            },
            customers: {
                title: 'Клиенты',
                search: 'Поиск клиента...',
                noCustomers: 'Клиенты не найдены',
                adjustSearch: 'Попробуйте изменить поиск',
                customersAppear: 'Клиенты появятся после добавления',
                clear: 'Нет долга',
                limitReached: 'Лимит исчерпан',
                hasBalance: 'Есть долг',
                unknown: 'Неизвестно',
                details: 'Информация о клиенте',
                phone: 'Телефон',
                address: 'Адрес',
                creditInfo: 'Кредитная информация',
                creditLimit: 'Кредитный лимит',
                currentDebt: 'Текущий долг',
                noBalance: 'Нет задолженности',
                creditLimitReached: 'Кредитный лимит исчерпан',
                hasOutstanding: 'Есть задолженность',
                createOrder: 'Создать заказ'
            },
            menu: {
                title: 'Меню',
                account: 'Аккаунт',
                support: 'Поддержка',
                profile: 'Профиль',
                notifications: 'Уведомления',
                settings: 'Настройки',
                help: 'Помощь и поддержка',
                privacy: 'Конфиденциальность',
                language: 'Язык',
                signOut: 'Выйти',
                forSales: 'для продаж',
                version: 'Версия'
            },
            addCustomer: {
                title: 'Новый клиент',
                businessName: 'Название компании',
                phone: 'Телефон',
                email: 'Email',
                address: 'Адрес',
                territory: 'Территория',
                waymark: 'Ориентир',
                notes: 'Примечания',
                enterName: 'Введите название',
                phoneNumber: 'Номер телефона',
                emailAddress: 'Email адрес',
                fullAddress: 'Полный адрес',
                selectTerritory: 'Выберите территорию...',
                waymarkPlaceholder: 'Например: рядом с мечетью, напротив банка',
                waymarkHint: 'Ориентир для нахождения клиента',
                additionalNotes: 'Дополнительные примечания...',
                useLocation: 'Использовать текущее местоположение',
                cancel: 'Отмена',
                save: 'Сохранить',
                required: 'Обязательное поле',
                fillRequired: 'Заполните все обязательные поля',
                geoNotSupported: 'Браузер не поддерживает геолокацию',
                addressFromLocation: 'Адрес обновлён по местоположению',
                geoFailed: 'Не удалось получить адрес',
                permissionDenied: 'Доступ к геолокации запрещён',
                positionUnavailable: 'Местоположение недоступно',
                timeout: 'Превышено время ожидания',
                unknownGeoError: 'Неизвестная ошибка',
                customerCreated: 'Клиент успешно создан',
                createFailed: 'Ошибка создания клиента'
            },
            productDetail: {
                details: 'Подробности',
                outOfStock: 'Нет в наличии',
                inStock: 'в наличии',
                per: 'за',
                description: 'Описание',
                inCart: 'в корзине',
                addToCart: 'В корзину'
            },
            common: {
                loading: 'Загрузка...',
                error: 'Ошибка',
                retry: 'Повторить',
                cancel: 'Отмена',
                save: 'Сохранить',
                close: 'Закрыть',
                confirm: 'Подтвердить',
                delete: 'Удалить'
            },
            visits: {
                title: 'Визиты',
                today: 'Сегодня',
                total: 'всего',
                planned: 'Запланировано',
                inProgress: 'В процессе',
                completed: 'Выполнено',
                cancelled: 'Отменено',
                noVisits: 'Нет визитов',
                noVisitsDesc: 'На сегодня визитов не запланировано',
                start: 'Начать',
                complete: 'Завершить',
                orderPlaced: 'Заказ оформлен',
                visitStarted: 'Визит начат',
                startFailed: 'Ошибка начала визита',
                visitCompleted: 'Визит завершён',
                completeFailed: 'Ошибка завершения визита',
                completeVisit: 'Завершить визит',
                outcomeOrderPlaced: 'Заказ оформлен',
                outcomeNoOrder: 'Без заказа',
                outcomeFollowUp: 'Перезвонить',
                outcomeNotAvailable: 'Клиент отсутствует',
                notesPlaceholder: 'Примечания...',
                createOrder: 'Создать заказ',
                finish: 'Готово',
                scheduleTitle: 'Запланировать визит',
                schedulingFor: 'Для клиента',
                date: 'Дата',
                time: 'Время',
                notes: 'Примечания',
                scheduleSuccess: 'Визит запланирован',
                scheduleFailed: 'Ошибка планирования',
                history: 'История',
                allVisits: 'Все визиты',
                missed: 'Пропущено',
                photos: 'Фотографии',
                previousDay: 'Предыдущий день',
                nextDay: 'Следующий день',
                callCustomer: 'Позвонить клиенту',
                addPhoto: 'Добавить фото',
                removePhoto: 'Удалить фото'
            },
            customerDetail: {
                title: 'Детали клиента',
                phone: 'Телефон',
                address: 'Адрес',
                creditInfo: 'Кредитная информация',
                creditLimit: 'Кредитный лимит',
                currentDebt: 'Текущий долг',
                noBalance: 'Нет задолженности',
                creditLimitReached: 'Кредитный лимит достигнут',
                hasBalance: 'Есть задолженность',
                createOrder: 'Создать заказ',
                scheduleVisit: 'Запланировать визит',
                close: 'Закрыть'
            },
            quickVisit: {
                title: 'Быстрый визит',
                searchCustomer: 'Поиск клиента...',
                noCustomers: 'Клиенты не найдены',
                takePhoto: 'Сделайте фото',
                tapToCapture: 'Нажмите для съёмки',
                uploading: 'Загрузка...',
                photoUploadFailed: 'Ошибка загрузки фото',
                skip: 'Пропустить',
                next: 'Далее',
                visitTo: 'Визит к:',
                whatHappened: 'Какой результат?',
                orderPlaced: 'Заказ оформлен',
                orderPlacedDesc: 'Перейти в каталог и оформить заказ',
                noOrder: 'Без заказа',
                noOrderDesc: 'Укажите причину',
                followUp: 'Перезвонить',
                followUpDesc: 'Назначить напоминание',
                whyNoOrder: 'Почему без заказа?',
                selectReason: 'Выберите причину',
                enterReason: 'Введите причину...',
                complete: 'Завершить',
                scheduleFollowUp: 'Назначить напоминание',
                reason: 'Причина',
                date: 'Дата',
                time: 'Время',
                noteOptional: 'Примечание (опционально)...',
                schedule: 'Сохранить',
                visitCompleted: 'Визит сохранён!',
                visitFailed: 'Ошибка сохранения',
                reasons: {
                    closed: 'Магазин закрыт',
                    has_stock: 'Товар есть',
                    high_price: 'Цена высокая',
                    competitor: 'Выбрал конкурента',
                    no_budget: 'Нет бюджета',
                    payment_issue: 'Проблема с оплатой',
                    quality_issue: 'Проблема качества',
                    not_interested: 'Не интересует',
                    other: 'Другое'
                },
                followUpReasons: {
                    owner_absent: 'Владелец отсутствует',
                    decision_pending: 'Ждёт решения',
                    busy_now: 'Сейчас занят',
                    callback_requested: 'Просил перезвонить',
                    delivery_awaited: 'Ждёт доставку',
                    other: 'Другое'
                }
            }
        }
    },

    en: {
        login: {
            title: 'Customer Portal',
            subtitle: 'View your orders',
            phoneLabel: 'Phone number',
            phonePlaceholder: '+998 90 123 45 67',
            otpLabel: 'Verification code',
            otpPlaceholder: '123456',
            otpSent: 'Code sent to {phone}',
            submit: 'Continue',
            verify: 'Verify',
            back: 'Back',
            sending: 'Sending...',
            checking: 'Checking...',
            errors: {
                tenantNotFound: 'Company not found',
                customerNotFound: 'Phone number not found',
                invalidOtp: 'Invalid code',
                otpExpired: 'Code expired',
                noTelegram: 'Telegram not linked',
                rateLimited: 'Too many attempts. Try again later'
            }
        },
        dashboard: {
            hello: 'Hello, {name}!',
            update: 'Refresh',
            logout: 'Logout',
            offline: 'No internet connection. App is running offline.',
            debt: 'Debt:',
            loading: 'Loading...'
        },
        tabs: {
            orders: 'Orders',
            catalog: 'Catalog',
            favorites: 'Favorites',
            payments: 'Payments',
            profile: 'Profile'
        },
        orders: {
            filter: 'Filter',
            ordersCount: 'order(s)',
            debt: 'Debt',
            filters: {
                all: 'All',
                pending: 'Pending',
                delivering: 'Delivering',
                delivered: 'Delivered',
                cancelled: 'Cancelled'
            },
            empty: 'No orders found',
            number: '#{number}',
            reorder: 'Reorder',
            cancel: 'Cancel',
            loadMore: 'Load more',
            status: {
                pending: 'Pending',
                confirmed: 'Confirmed',
                approved: 'Preparing',
                delivering: 'Delivering',
                delivered: 'Delivered',
                cancelled: 'Cancelled',
                returned: 'Returned'
            },
            paymentStatus: {
                unpaid: 'Unpaid',
                partial: 'Partial',
                paid: 'Paid'
            }
        },
        products: {
            search: 'Search products...',
            allCategories: 'All categories',
            empty: 'No products found',
            view: 'View',
            inStock: 'In stock: {qty} pcs',
            outOfStock: 'Out of stock',
            lowStock: 'Only {qty} left!',
            addToCart: 'Add to cart',
            sort: {
                label: 'Sort',
                default: 'Default',
                priceAsc: 'Price: low to high',
                priceDesc: 'Price: high to low',
                nameAsc: 'Name: A-Z',
                nameDesc: 'Name: Z-A',
                newest: 'Newest'
            },
            recentSearches: 'Recent searches',
            clearHistory: 'Clear'
        },
        reviews: {
            title: 'Reviews',
            writeReview: 'Write a review',
            yourRating: 'Your rating',
            commentPlaceholder: 'Your opinion on the product...',
            submit: 'Submit',
            noReviews: 'No reviews yet',
            reviewCount: 'review(s)'
        },
        cart: {
            title: 'Cart ({count})',
            empty: 'Cart is empty',
            emptyDescription: 'Add products from the catalog',
            browseProducts: 'Browse catalog',
            total: 'Total:',
            subtotal: 'Subtotal:',
            discount: 'Discount:',
            lineTotal: '{qty} × {price}',
            notes: 'Notes (optional)',
            deliveryAddress: 'Delivery address',
            selectAddress: 'Select address...',
            otherAddress: 'Other address...',
            enterAddress: 'Enter address...',
            checkout: 'Place order',
            processing: 'Processing...',
            success: 'Order created successfully',
            error: 'An error occurred',
            discountCode: 'Promo code',
            applyDiscount: 'Apply',
            discountApplied: 'Discount applied!',
            invalidDiscount: 'Invalid promo code',
            removeDiscount: 'Remove discount',
            addressRequired: 'Please enter delivery address',
            autoDiscountHint: 'Automatic discount will be applied',
            checkingDiscounts: 'Checking discounts...'
        },
        payments: {
            totalPaid: 'Total paid:',
            empty: 'No payments',
            emptyDescription: 'Payments for orders will appear here'
        },
        profile: {
            name: 'Name',
            phone: 'Phone',
            email: 'Email',
            address: 'Address',
            addresses: 'Addresses',
            noAddresses: 'No addresses',
            addAddress: 'Add address',
            editAddress: 'Edit address',
            default: 'Default',
            setAsDefault: 'Set as default',
            edit: 'Edit',
            save: 'Save',
            cancel: 'Cancel',
            profileUpdated: 'Profile updated',
            addressAdded: 'Address added',
            addressUpdated: 'Address updated',
            addressDeleted: 'Address deleted',
            defaultChanged: 'Default address changed',
            support: 'Support',
            noContact: 'Contact info not available',
            stats: {
                orders: 'Orders',
                payments: 'Payments'
            }
        },
        favorites: {
            empty: 'No favorites yet',
            emptyDescription: 'Tap the ❤️ on products',
            browseProducts: 'Browse catalog'
        },
        modals: {
            cancelOrder: 'Cancel this order?',
            deleteAddress: 'Delete this address?',
            logout: 'Log out?',
            addressName: 'Name (e.g., Home, Office)',
            fullAddress: 'Full address',
            setAsDefault: 'Set as default',
            addressNamePlaceholder: 'Home, Office...',
            addressPlaceholder: 'City, street, house...'
        },
        orderConfirmation: {
            title: 'Order placed!',
            orderNumber: 'Order number',
            items: '{count} item(s)',
            total: 'Total amount',
            estimatedDelivery: 'Estimated delivery',
            today: 'Today',
            tomorrow: 'Tomorrow',
            days: 'In {days} days',
            trackOrder: 'Track order',
            continueShopping: 'Continue shopping',
            shareOrder: 'Share',
            thankYou: 'Thank you for your purchase!',
            notification: 'We\'ll notify you when the status changes'
        },
        errors: {
            generic: 'An error occurred',
            network: 'No internet connection',
            tryAgain: 'Try again',
            sessionExpired: 'Session expired, please log in again',
            unauthorized: 'Authorization required',
            notFound: 'Not found',
            validation: 'Invalid data',
            serverError: 'Server error'
        },
        actions: {
            retry: 'Retry',
            close: 'Close',
            confirm: 'Confirm',
            delete: 'Delete',
            share: 'Share',
            copy: 'Copy'
        },
        theme: {
            light: 'Light mode',
            dark: 'Dark mode',
            system: 'System'
        },
        orderDetail: {
            title: 'Order',
            orderStatus: 'Order status',
            unpaidAmount: 'Amount due',
            pay: 'Pay',
            fullyPaid: 'Fully paid',
            products: 'Products',
            summary: 'Summary',
            subtotal: 'Subtotal',
            discount: 'Discount',
            total: 'Total',
            paid: 'Paid',
            remaining: 'Remaining',
            notes: 'Notes',
            loading: 'Loading...',
            notFound: 'Order not found',
            back: 'Back'
        },
        paymentPortal: {
            title: 'Payment',
            loading: 'Loading...',
            error: 'Error',
            tokenNotFound: 'Token not found',
            paymentNotFound: 'Payment information not found',
            genericError: 'An error occurred. Please try again.',
            backToHome: 'Back to home',
            paymentSuccess: 'Payment successful!',
            order: 'Order',
            amount: 'Amount',
            thankYou: 'Thank you for your purchase! 🙏',
            expired: 'Expired',
            expiredMessage: 'This payment link has expired.',
            contactSeller: 'Contact the seller for a new link.',
            cancelled: 'Payment cancelled',
            cancelledMessage: 'This payment has been cancelled.',
            customer: 'Customer',
            paymentAmount: 'Payment amount',
            selectPaymentMethod: 'Select payment method:',
            payWithClick: 'Pay with Click',
            payWithPayme: 'Pay with Payme',
            noPaymentMethods: 'Payment methods not configured. Contact seller.',
            securePayment: '🔒 All payments are secure',
            poweredBy: 'Powered by IxaSales'
        },
        salesApp: {
            nav: {
                home: 'Home',
                catalog: 'Catalog',
                orders: 'Orders',
                customers: 'Customers',
                menu: 'Menu'
            },
            dashboard: {
                greeting: 'Good {timeOfDay}, {name}!',
                morning: 'morning',
                afternoon: 'afternoon',
                evening: 'evening',
                todaysSales: "Today's Sales",
                pendingOrders: 'Pending',
                myCustomers: 'My Customers',
                recentOrders: 'Recent Orders',
                viewAll: 'View All',
                noCustomers: 'No customers assigned',
                noOrders: 'No orders today',
                quickActions: 'Quick Actions',
                newOrder: 'New Order',
                addCustomer: 'Add Customer'
            },
            catalog: {
                search: 'Search products...',
                all: 'All',
                allBrands: 'All Brands',
                brand: 'Brand',
                clearFilters: 'Clear all filters',
                noProducts: 'No products found',
                adjustSearch: 'Try adjusting your search or filters',
                productsAppear: 'Products will appear here once added',
                outOfStock: 'Out of Stock',
                items: 'items'
            },
            cart: {
                title: 'Shopping Cart',
                items: 'items',
                clearAll: 'Clear All',
                empty: 'Cart is empty',
                addProducts: 'Add products to start an order',
                browseCatalog: 'Browse Catalog',
                selectCustomer: 'Select Customer',
                tapToChange: 'Tap to change',
                required: 'Required',
                requiredForOrder: 'Required for order',
                subtotal: 'Subtotal',
                total: 'Total',
                submitOrder: 'Submit Order',
                submitting: 'Submitting...',
                orderSubmitted: 'Order Submitted!',
                redirecting: 'Redirecting to dashboard...',
                selectCustomerFirst: 'Please select a customer first',
                cartEmpty: 'Cart is empty',
                searchCustomers: 'Search customers...',
                loadingCustomers: 'Loading customers...',
                noCustomersFound: 'No customers found',
                new: 'New'
            },
            orders: {
                title: 'My Orders',
                orders: 'orders',
                search: 'Search order number...',
                all: 'All',
                pending: 'Pending',
                delivered: 'Delivered',
                returned: 'Returned',
                paid: 'Paid',
                loading: 'Loading...',
                noOrders: 'No orders found',
                createOrder: 'Create an order',
                orderDetails: 'Order Details',
                status: 'Status',
                products: 'Products',
                notes: 'Notes',
                close: 'Close',
                each: 'each'
            },
            customers: {
                title: 'Customers',
                search: 'Search customers...',
                noCustomers: 'No customers found',
                adjustSearch: 'Try adjusting your search',
                customersAppear: 'Customers will appear here once added',
                clear: 'Clear',
                limitReached: 'Limit Reached',
                hasBalance: 'Has Balance',
                unknown: 'Unknown',
                details: 'Customer Details',
                phone: 'Phone',
                address: 'Address',
                creditInfo: 'Credit Information',
                creditLimit: 'Credit Limit',
                currentDebt: 'Current Debt',
                noBalance: 'No Outstanding Balance',
                creditLimitReached: 'Credit Limit Reached',
                hasOutstanding: 'Has Outstanding Balance',
                createOrder: 'Create Order'
            },
            menu: {
                title: 'Menu',
                account: 'Account',
                support: 'Support',
                profile: 'Profile',
                notifications: 'Notifications',
                settings: 'Settings',
                help: 'Help & Support',
                privacy: 'Privacy & Security',
                language: 'Language',
                signOut: 'Sign Out',
                forSales: 'for Sales',
                version: 'Version'
            },
            addCustomer: {
                title: 'New Customer',
                businessName: 'Business Name',
                phone: 'Phone',
                email: 'Email',
                address: 'Address',
                territory: 'Territory',
                waymark: 'Landmark',
                notes: 'Notes',
                enterName: 'Enter business name',
                phoneNumber: 'Phone number',
                emailAddress: 'Email address',
                fullAddress: 'Full address',
                selectTerritory: 'Select territory...',
                waymarkPlaceholder: 'E.g. near the mosque, opposite the bank',
                waymarkHint: 'Landmark to help find the customer',
                additionalNotes: 'Additional notes...',
                useLocation: 'Use current location',
                cancel: 'Cancel',
                save: 'Save Customer',
                required: 'Required field',
                fillRequired: 'Please fill all required fields',
                geoNotSupported: 'Geolocation is not supported by your browser',
                addressFromLocation: 'Address updated from location',
                geoFailed: 'Failed to get address from coordinates',
                permissionDenied: 'Location permission denied. Please enable it in browser settings.',
                positionUnavailable: 'Location information is unavailable. Check your GPS.',
                timeout: 'Location request timed out.',
                unknownGeoError: 'An unknown error occurred getting location.',
                customerCreated: 'Customer created successfully',
                createFailed: 'Failed to create customer'
            },
            productDetail: {
                details: 'Details',
                outOfStock: 'Out of Stock',
                inStock: 'in stock',
                per: 'per',
                description: 'Description',
                inCart: 'in cart',
                addToCart: 'Add to Cart'
            },
            common: {
                loading: 'Loading...',
                error: 'Error',
                retry: 'Retry',
                cancel: 'Cancel',
                save: 'Save',
                close: 'Close',
                confirm: 'Confirm',
                delete: 'Delete'
            },
            visits: {
                title: 'Visits',
                today: 'Today',
                total: 'total',
                planned: 'Planned',
                inProgress: 'In Progress',
                completed: 'Completed',
                cancelled: 'Cancelled',
                noVisits: 'No visits',
                noVisitsDesc: 'No visits scheduled for today',
                start: 'Start',
                complete: 'Complete',
                orderPlaced: 'Order placed',
                visitStarted: 'Visit started',
                startFailed: 'Failed to start visit',
                visitCompleted: 'Visit completed',
                completeFailed: 'Failed to complete visit',
                completeVisit: 'Complete Visit',
                outcomeOrderPlaced: 'Order Placed',
                outcomeNoOrder: 'No Order',
                outcomeFollowUp: 'Follow Up',
                outcomeNotAvailable: 'Not Available',
                notesPlaceholder: 'Notes...',
                createOrder: 'Create Order',
                finish: 'Finish',
                scheduleTitle: 'Schedule Visit',
                schedulingFor: 'Scheduling for',
                date: 'Date',
                time: 'Time',
                notes: 'Notes',
                scheduleSuccess: 'Visit scheduled successfully',
                scheduleFailed: 'Failed to schedule visit',
                history: 'History',
                allVisits: 'All visits',
                missed: 'Missed',
                photos: 'Photos',
                previousDay: 'Previous day',
                nextDay: 'Next day',
                callCustomer: 'Call customer',
                addPhoto: 'Add photo',
                removePhoto: 'Remove photo'
            },
            customerDetail: {
                title: 'Customer Details',
                phone: 'Phone',
                address: 'Address',
                creditInfo: 'Credit Information',
                creditLimit: 'Credit Limit',
                currentDebt: 'Current Debt',
                noBalance: 'No Outstanding Balance',
                creditLimitReached: 'Credit Limit Reached',
                hasBalance: 'Has Outstanding Balance',
                createOrder: 'Create Order',
                scheduleVisit: 'Schedule Visit',
                close: 'Close'
            },
            quickVisit: {
                title: 'Quick Visit',
                searchCustomer: 'Search customer...',
                noCustomers: 'No customers found',
                takePhoto: 'Take a photo',
                tapToCapture: 'Tap to capture',
                uploading: 'Uploading...',
                photoUploadFailed: 'Photo upload failed',
                skip: 'Skip',
                next: 'Next',
                visitTo: 'Visit to:',
                whatHappened: 'What was the outcome?',
                orderPlaced: 'Order Placed',
                orderPlacedDesc: 'Go to catalog and place an order',
                noOrder: 'No Order',
                noOrderDesc: 'Select a reason',
                followUp: 'Follow Up',
                followUpDesc: 'Schedule a reminder',
                whyNoOrder: 'Why no order?',
                selectReason: 'Select a reason',
                enterReason: 'Enter reason...',
                complete: 'Complete',
                scheduleFollowUp: 'Schedule reminder',
                reason: 'Reason',
                date: 'Date',
                time: 'Time',
                noteOptional: 'Note (optional)...',
                schedule: 'Save',
                visitCompleted: 'Visit saved!',
                visitFailed: 'Failed to save visit',
                reasons: {
                    closed: 'Store closed',
                    has_stock: 'Has enough stock',
                    high_price: 'Price too high',
                    competitor: 'Chose competitor',
                    no_budget: 'No budget',
                    payment_issue: 'Payment issues',
                    quality_issue: 'Quality concerns',
                    not_interested: 'Not interested',
                    other: 'Other'
                },
                followUpReasons: {
                    owner_absent: 'Owner not present',
                    decision_pending: 'Decision pending',
                    busy_now: 'Busy right now',
                    callback_requested: 'Requested callback',
                    delivery_awaited: 'Waiting for delivery',
                    other: 'Other'
                }
            }
        }
    }
};

// ============================================================================
// TYPES
// ============================================================================

export type Language = keyof typeof translations;
export type TranslationKey = keyof typeof translations.uz;

// ============================================================================
// LANGUAGE DETECTION & STORAGE
// ============================================================================

const LANGUAGE_KEY = 'customer_portal_language';

const detectLanguage = (): Language => {
    // Check localStorage first
    const saved = localStorage.getItem(LANGUAGE_KEY);
    if (saved && saved in translations) {
        return saved as Language;
    }

    // Detect from browser
    const browserLang = navigator.language.split('-')[0];
    if (browserLang in translations) {
        return browserLang as Language;
    }

    return 'uz'; // Default
};

// ============================================================================
// I18N STATE
// ============================================================================

// Global signal for language (used outside context)
const [currentLanguage, setCurrentLanguage] = createSignal<Language>(detectLanguage());

// ============================================================================
// TRANSLATION FUNCTION
// ============================================================================

const createTranslate = (lang: () => Language) => {
    return (path: string, params?: Record<string, string | number>): string => {
        const keys = path.split('.');
        let value: any = translations[lang()] || translations.uz;

        for (const key of keys) {
            value = value?.[key];
        }

        if (!value) {
            // Fallback to Uzbek
            value = translations.uz;
            for (const key of keys) {
                value = value?.[key];
            }
        }

        if (!value) return path;

        if (params) {
            return Object.entries(params).reduce((acc, [k, v]) => {
                return acc.replace(`{${k}}`, String(v));
            }, value);
        }

        return value;
    };
};

// ============================================================================
// HOOKS
// ============================================================================

export const useI18n = (lang?: Language) => {
    const t = createTranslate(lang ? () => lang : currentLanguage);

    const setLanguage = (newLang: Language) => {
        setCurrentLanguage(newLang);
        localStorage.setItem(LANGUAGE_KEY, newLang);
        document.documentElement.lang = newLang;
    };

    return {
        t,
        language: currentLanguage,
        setLanguage,
        availableLanguages: Object.keys(translations) as Language[]
    };
};

// ============================================================================
// ERROR CODE TRANSLATIONS
// ============================================================================

export const errorCodeTranslations: Record<string, Record<Language, string>> = {
    UNAUTHORIZED: {
        uz: 'Tizimga kirish talab qilinadi',
        ru: 'Требуется авторизация',
        en: 'Authorization required'
    },
    INVALID_TOKEN: {
        uz: 'Sessiya tugadi',
        ru: 'Сессия истекла',
        en: 'Session expired'
    },
    TENANT_NOT_FOUND: {
        uz: 'Kompaniya topilmadi',
        ru: 'Компания не найдена',
        en: 'Company not found'
    },
    CUSTOMER_NOT_FOUND: {
        uz: 'Mijoz topilmadi',
        ru: 'Клиент не найден',
        en: 'Customer not found'
    },
    NO_TELEGRAM: {
        uz: 'Telegram ulangan emas',
        ru: 'Telegram не подключён',
        en: 'Telegram not linked'
    },
    OTP_SEND_FAILED: {
        uz: 'Kodni yuborib bo\'lmadi',
        ru: 'Не удалось отправить код',
        en: 'Failed to send code'
    },
    INVALID_OTP: {
        uz: 'Noto\'g\'ri kod',
        ru: 'Неверный код',
        en: 'Invalid code'
    },
    OTP_EXPIRED: {
        uz: 'Kod muddati tugagan',
        ru: 'Код истёк',
        en: 'Code expired'
    },
    RATE_LIMITED: {
        uz: 'Ko\'p urinish. Keyinroq qaytadan urining',
        ru: 'Слишком много попыток. Попробуйте позже',
        en: 'Too many attempts. Try again later'
    },
    NOT_FOUND: {
        uz: 'Topilmadi',
        ru: 'Не найдено',
        en: 'Not found'
    },
    ORDER_NOT_CANCELLABLE: {
        uz: 'Buyurtmani bekor qilib bo\'lmaydi',
        ru: 'Заказ нельзя отменить',
        en: 'Order cannot be cancelled'
    },
    EMPTY_CART: {
        uz: 'Savat bo\'sh',
        ru: 'Корзина пуста',
        en: 'Cart is empty'
    },
    INSUFFICIENT_STOCK: {
        uz: 'Yetarli mahsulot yo\'q',
        ru: 'Недостаточно товара',
        en: 'Insufficient stock'
    },
    DISCOUNT_NOT_FOUND: {
        uz: 'Chegirma topilmadi',
        ru: 'Скидка не найдена',
        en: 'Discount not found'
    },
    DISCOUNT_INACTIVE: {
        uz: 'Chegirma faol emas',
        ru: 'Скидка неактивна',
        en: 'Discount is inactive'
    },
    DISCOUNT_EXPIRED: {
        uz: 'Chegirma muddati tugagan',
        ru: 'Скидка истекла',
        en: 'Discount expired'
    },
    MIN_ORDER_AMOUNT: {
        uz: 'Minimal buyurtma summasi yetarli emas',
        ru: 'Минимальная сумма заказа не достигнута',
        en: 'Minimum order amount not reached'
    },
    REORDER_LIMIT: {
        uz: 'Qayta buyurtma limiti tugagan',
        ru: 'Лимит повторных заказов исчерпан',
        en: 'Reorder limit exceeded'
    },
    VALIDATION_ERROR: {
        uz: 'Ma\'lumotlar noto\'g\'ri',
        ru: 'Неверные данные',
        en: 'Invalid data'
    },
    SERVER_ERROR: {
        uz: 'Server xatosi',
        ru: 'Ошибка сервера',
        en: 'Server error'
    }
};

/**
 * Translate error code to user-friendly message
 */
export const translateErrorCode = (code: string, lang?: Language): string => {
    const language = lang || currentLanguage();
    return errorCodeTranslations[code]?.[language] || code;
};
