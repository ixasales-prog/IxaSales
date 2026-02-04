const fs = require('fs');

const filePath = 'd:\\Projects5\\IxaSales\\client\\src\\i18n.ts';
const content = fs.readFileSync(filePath, 'utf-8');

const uzbekWarehouse = `        },
        warehouseApp: {
            nav: {
                overview: 'Umumiy',
                tasks: 'Vazifalar',
                inventory: 'Inventar',
                receiving: 'Qabul qilish'
            },
            dashboard: {
                title: 'Ombor ko\\'rib chiqish',
                subtitle: 'Vazifalar navbati, zaxira ogohlantirishi va qabul qilish',
                openTasks: 'Ochiq vazifalar',
                lowStock: 'Kam zaxira',
                alerts: 'Ogohlantirishlar',
                awaitingPutaway: 'Joylashtirish kutilmoqda',
                damagedItems: 'Shikastlangan tovarlar',
                inboundToday: 'Bugun kelish',
                shipmentsScheduled: 'ta jo\\'natma rejalashtirilgan'
            },
            tasks: {
                title: 'Vazifalar navbati',
                subtitle: 'Ustuvor buyurtmalar, qadoqlash va qabul qilish',
                loading: 'Yuklanmoqda...',
                noTasks: 'Navbatda vazifalar yo\\'q',
                markComplete: 'Bajarilgan deb belgilash',
                taskDetail: 'Vazifa tafsilotlari',
                back: 'Orqaga',
                orderNumber: 'Buyurtma raqami',
                status: 'Holat',
                customer: 'Mijoz',
                items: 'Tovarlar',
                unknownCustomer: 'Noma\\'lum mijoz',
                unknownItem: 'Noma\\'lum tovar',
                picked: 'terildi',
                ordered: 'buyurtma qilindi',
                statusUpdated: 'Holat yangilandi',
                updateFailed: 'Vazifani yangilashda xato'
            },
            inventory: {
                title: 'Inventar',
                subtitle: 'Zaxira darajalari va ogohlantirishlar',
                loading: 'Yuklanmoqda...',
                empty: 'Inventar bo\\'sh',
                lowStockBadge: 'kam',
                okBadge: 'yaxshi',
                reorderNeeded: 'Qayta buyurtma kerak',
                available: 'Mavjud',
                details: 'Tafsilotlar',
                back: 'Orqaga',
                sku: 'SKU',
                description: 'Tavsif',
                stockQuantity: 'Zaxira miqdori',
                reorderPoint: 'Qayta buyurtma nuqtasi',
                costPrice: 'Tan narxi',
                price: 'Narx',
                notFound: 'Tovar topilmadi'
            },
            receiving: {
                title: 'Qabul qilish',
                subtitle: 'Kiruvchi jo\\'natmalar va dok holati',
                loading: 'Yuklanmoqda...',
                empty: 'Rejalashtirilgan kiruvchi jo\\'natmalar yo\\'q',
                markReceived: 'Qabul qilindi deb belgilash',
                receivingDetail: 'Qabul qilish tafsilotlari',
                back: 'Orqaga',
                poNumber: 'Xarid raqami',
                status: 'Holat',
                supplier: 'Ta\\'minotchi',
                unknownSupplier: 'Noma\\'lum ta\\'minotchi',
                expectedDate: 'Kutilayotgan sana',
                notes: 'Izohlar',
                items: 'Tovarlar',
                received: 'qabul qilindi',
                ordered: 'buyurtma qilindi',
                unknownItem: 'Noma\\'lum tovar',
                notFound: 'Qabul qilish topilmadi',
                statusUpdated: 'Holat yangilandi',
                updateFailed: 'Qabul qilishni yangilashda xato'
            },
            common: {
                loading: 'Yuklanmoqda...',
                error: 'Xato',
                retry: 'Qayta urinish',
                cancel: 'Bekor qilish',
                save: 'Saqlash',
                close: 'Yopish',
                confirm: 'Tasdiqlash',
                delete: 'O\\'chirish'
            }
`;

// Find the position to insert (after quickVisit closing in uz section, before the closing of salesApp)
const marker = "            }\r\n        }\r\n    },\r\n\r\n    ru: {";
const newContent = content.replace(marker, uzbekWarehouse + "\r\n        }\r\n    },\r\n\r\n    ru: {");

fs.writeFileSync(filePath, newContent, 'utf-8');
console.log('✅ Uzbek warehouse translations added successfully!');
