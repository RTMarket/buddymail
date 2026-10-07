export interface GeoCityOption { value: string; label: string; }
export interface GeoStateOption { value: string; label: string; cities: GeoCityOption[]; }
/** ISO 3166-1 alpha-2 → 省/州列表（含下属主要城市） */
export const COUNTRY_GEO: Record<string, GeoStateOption[]> = {
  US: [
    { value: "AL", label: "Alabama", cities: [
      { value: "Birmingham", label: "Birmingham" },
      { value: "Montgomery", label: "Montgomery" },
      { value: "Huntsville", label: "Huntsville" },
      { value: "Mobile", label: "Mobile" },
      { value: "Tuscaloosa", label: "Tuscaloosa" },
    ] },
    { value: "AK", label: "Alaska", cities: [
      { value: "Anchorage", label: "Anchorage" },
      { value: "Fairbanks", label: "Fairbanks" },
      { value: "Juneau", label: "Juneau" },
      { value: "Wasilla", label: "Wasilla" },
    ] },
    { value: "AZ", label: "Arizona", cities: [
      { value: "Phoenix", label: "Phoenix" },
      { value: "Tucson", label: "Tucson" },
      { value: "Mesa", label: "Mesa" },
      { value: "Scottsdale", label: "Scottsdale" },
      { value: "Chandler", label: "Chandler" },
      { value: "Glendale", label: "Glendale" },
    ] },
    { value: "AR", label: "Arkansas", cities: [
      { value: "Little Rock", label: "Little Rock" },
      { value: "Fayetteville", label: "Fayetteville" },
      { value: "Fort Smith", label: "Fort Smith" },
      { value: "Springdale", label: "Springdale" },
    ] },
    { value: "CA", label: "California", cities: [
      { value: "Los Angeles", label: "Los Angeles" },
      { value: "San Francisco", label: "San Francisco" },
      { value: "San Diego", label: "San Diego" },
      { value: "San Jose", label: "San Jose" },
      { value: "Sacramento", label: "Sacramento" },
      { value: "Oakland", label: "Oakland" },
      { value: "Fresno", label: "Fresno" },
      { value: "Irvine", label: "Irvine" },
    ] },
    { value: "CO", label: "Colorado", cities: [
      { value: "Denver", label: "Denver" },
      { value: "Colorado Springs", label: "Colorado Springs" },
      { value: "Aurora", label: "Aurora" },
      { value: "Boulder", label: "Boulder" },
      { value: "Fort Collins", label: "Fort Collins" },
    ] },
    { value: "CT", label: "Connecticut", cities: [
      { value: "Hartford", label: "Hartford" },
      { value: "New Haven", label: "New Haven" },
      { value: "Stamford", label: "Stamford" },
      { value: "Bridgeport", label: "Bridgeport" },
    ] },
    { value: "DE", label: "Delaware", cities: [
      { value: "Wilmington", label: "Wilmington" },
      { value: "Dover", label: "Dover" },
      { value: "Newark", label: "Newark" },
    ] },
    { value: "DC", label: "District of Columbia", cities: [
      { value: "Washington", label: "Washington" },
    ] },
    { value: "FL", label: "Florida", cities: [
      { value: "Miami", label: "Miami" },
      { value: "Orlando", label: "Orlando" },
      { value: "Tampa", label: "Tampa" },
      { value: "Jacksonville", label: "Jacksonville" },
      { value: "Fort Lauderdale", label: "Fort Lauderdale" },
      { value: "Tallahassee", label: "Tallahassee" },
    ] },
    { value: "GA", label: "Georgia", cities: [
      { value: "Atlanta", label: "Atlanta" },
      { value: "Savannah", label: "Savannah" },
      { value: "Augusta", label: "Augusta" },
      { value: "Columbus", label: "Columbus" },
      { value: "Macon", label: "Macon" },
    ] },
    { value: "HI", label: "Hawaii", cities: [
      { value: "Honolulu", label: "Honolulu" },
      { value: "Hilo", label: "Hilo" },
      { value: "Kailua", label: "Kailua" },
    ] },
    { value: "ID", label: "Idaho", cities: [
      { value: "Boise", label: "Boise" },
      { value: "Meridian", label: "Meridian" },
      { value: "Idaho Falls", label: "Idaho Falls" },
      { value: "Nampa", label: "Nampa" },
    ] },
    { value: "IL", label: "Illinois", cities: [
      { value: "Chicago", label: "Chicago" },
      { value: "Springfield", label: "Springfield" },
      { value: "Naperville", label: "Naperville" },
      { value: "Peoria", label: "Peoria" },
      { value: "Rockford", label: "Rockford" },
    ] },
    { value: "IN", label: "Indiana", cities: [
      { value: "Indianapolis", label: "Indianapolis" },
      { value: "Fort Wayne", label: "Fort Wayne" },
      { value: "Evansville", label: "Evansville" },
      { value: "South Bend", label: "South Bend" },
    ] },
    { value: "IA", label: "Iowa", cities: [
      { value: "Des Moines", label: "Des Moines" },
      { value: "Cedar Rapids", label: "Cedar Rapids" },
      { value: "Davenport", label: "Davenport" },
      { value: "Iowa City", label: "Iowa City" },
    ] },
    { value: "KS", label: "Kansas", cities: [
      { value: "Wichita", label: "Wichita" },
      { value: "Overland Park", label: "Overland Park" },
      { value: "Kansas City", label: "Kansas City" },
      { value: "Topeka", label: "Topeka" },
    ] },
    { value: "KY", label: "Kentucky", cities: [
      { value: "Louisville", label: "Louisville" },
      { value: "Lexington", label: "Lexington" },
      { value: "Bowling Green", label: "Bowling Green" },
    ] },
    { value: "LA", label: "Louisiana", cities: [
      { value: "New Orleans", label: "New Orleans" },
      { value: "Baton Rouge", label: "Baton Rouge" },
      { value: "Shreveport", label: "Shreveport" },
      { value: "Lafayette", label: "Lafayette" },
    ] },
    { value: "ME", label: "Maine", cities: [
      { value: "Portland", label: "Portland" },
      { value: "Augusta", label: "Augusta" },
      { value: "Bangor", label: "Bangor" },
      { value: "Lewiston", label: "Lewiston" },
    ] },
    { value: "MD", label: "Maryland", cities: [
      { value: "Baltimore", label: "Baltimore" },
      { value: "Annapolis", label: "Annapolis" },
      { value: "Bethesda", label: "Bethesda" },
      { value: "Frederick", label: "Frederick" },
      { value: "Columbia", label: "Columbia" },
    ] },
    { value: "MA", label: "Massachusetts", cities: [
      { value: "Boston", label: "Boston" },
      { value: "Cambridge", label: "Cambridge" },
      { value: "Worcester", label: "Worcester" },
      { value: "Springfield", label: "Springfield" },
    ] },
    { value: "MI", label: "Michigan", cities: [
      { value: "Detroit", label: "Detroit" },
      { value: "Grand Rapids", label: "Grand Rapids" },
      { value: "Ann Arbor", label: "Ann Arbor" },
      { value: "Lansing", label: "Lansing" },
    ] },
    { value: "MN", label: "Minnesota", cities: [
      { value: "Minneapolis", label: "Minneapolis" },
      { value: "Saint Paul", label: "Saint Paul" },
      { value: "Rochester", label: "Rochester" },
      { value: "Duluth", label: "Duluth" },
    ] },
    { value: "MS", label: "Mississippi", cities: [
      { value: "Jackson", label: "Jackson" },
      { value: "Gulfport", label: "Gulfport" },
      { value: "Biloxi", label: "Biloxi" },
      { value: "Hattiesburg", label: "Hattiesburg" },
    ] },
    { value: "MO", label: "Missouri", cities: [
      { value: "Kansas City", label: "Kansas City" },
      { value: "St. Louis", label: "St. Louis" },
      { value: "Springfield", label: "Springfield" },
      { value: "Columbia", label: "Columbia" },
    ] },
    { value: "MT", label: "Montana", cities: [
      { value: "Billings", label: "Billings" },
      { value: "Missoula", label: "Missoula" },
      { value: "Bozeman", label: "Bozeman" },
      { value: "Helena", label: "Helena" },
    ] },
    { value: "NE", label: "Nebraska", cities: [
      { value: "Omaha", label: "Omaha" },
      { value: "Lincoln", label: "Lincoln" },
      { value: "Bellevue", label: "Bellevue" },
    ] },
    { value: "NV", label: "Nevada", cities: [
      { value: "Las Vegas", label: "Las Vegas" },
      { value: "Reno", label: "Reno" },
      { value: "Henderson", label: "Henderson" },
      { value: "Carson City", label: "Carson City" },
    ] },
    { value: "NH", label: "New Hampshire", cities: [
      { value: "Manchester", label: "Manchester" },
      { value: "Concord", label: "Concord" },
      { value: "Nashua", label: "Nashua" },
    ] },
    { value: "NJ", label: "New Jersey", cities: [
      { value: "Newark", label: "Newark" },
      { value: "Jersey City", label: "Jersey City" },
      { value: "Princeton", label: "Princeton" },
      { value: "Trenton", label: "Trenton" },
      { value: "Hoboken", label: "Hoboken" },
    ] },
    { value: "NM", label: "New Mexico", cities: [
      { value: "Albuquerque", label: "Albuquerque" },
      { value: "Santa Fe", label: "Santa Fe" },
      { value: "Las Cruces", label: "Las Cruces" },
    ] },
    { value: "NY", label: "New York", cities: [
      { value: "New York City", label: "New York City" },
      { value: "Buffalo", label: "Buffalo" },
      { value: "Rochester", label: "Rochester" },
      { value: "Albany", label: "Albany" },
      { value: "Syracuse", label: "Syracuse" },
    ] },
    { value: "NC", label: "North Carolina", cities: [
      { value: "Charlotte", label: "Charlotte" },
      { value: "Raleigh", label: "Raleigh" },
      { value: "Durham", label: "Durham" },
      { value: "Greensboro", label: "Greensboro" },
      { value: "Winston-Salem", label: "Winston-Salem" },
    ] },
    { value: "ND", label: "North Dakota", cities: [
      { value: "Fargo", label: "Fargo" },
      { value: "Bismarck", label: "Bismarck" },
      { value: "Grand Forks", label: "Grand Forks" },
    ] },
    { value: "OH", label: "Ohio", cities: [
      { value: "Columbus", label: "Columbus" },
      { value: "Cleveland", label: "Cleveland" },
      { value: "Cincinnati", label: "Cincinnati" },
      { value: "Toledo", label: "Toledo" },
      { value: "Dayton", label: "Dayton" },
    ] },
    { value: "OK", label: "Oklahoma", cities: [
      { value: "Oklahoma City", label: "Oklahoma City" },
      { value: "Tulsa", label: "Tulsa" },
      { value: "Norman", label: "Norman" },
    ] },
    { value: "OR", label: "Oregon", cities: [
      { value: "Portland", label: "Portland" },
      { value: "Eugene", label: "Eugene" },
      { value: "Salem", label: "Salem" },
      { value: "Bend", label: "Bend" },
    ] },
    { value: "PA", label: "Pennsylvania", cities: [
      { value: "Philadelphia", label: "Philadelphia" },
      { value: "Pittsburgh", label: "Pittsburgh" },
      { value: "Harrisburg", label: "Harrisburg" },
      { value: "Allentown", label: "Allentown" },
    ] },
    { value: "RI", label: "Rhode Island", cities: [
      { value: "Providence", label: "Providence" },
      { value: "Newport", label: "Newport" },
      { value: "Warwick", label: "Warwick" },
    ] },
    { value: "SC", label: "South Carolina", cities: [
      { value: "Columbia", label: "Columbia" },
      { value: "Charleston", label: "Charleston" },
      { value: "Greenville", label: "Greenville" },
      { value: "Myrtle Beach", label: "Myrtle Beach" },
    ] },
    { value: "SD", label: "South Dakota", cities: [
      { value: "Sioux Falls", label: "Sioux Falls" },
      { value: "Rapid City", label: "Rapid City" },
      { value: "Pierre", label: "Pierre" },
    ] },
    { value: "TN", label: "Tennessee", cities: [
      { value: "Nashville", label: "Nashville" },
      { value: "Memphis", label: "Memphis" },
      { value: "Knoxville", label: "Knoxville" },
      { value: "Chattanooga", label: "Chattanooga" },
    ] },
    { value: "TX", label: "Texas", cities: [
      { value: "Houston", label: "Houston" },
      { value: "Dallas", label: "Dallas" },
      { value: "Austin", label: "Austin" },
      { value: "San Antonio", label: "San Antonio" },
      { value: "Fort Worth", label: "Fort Worth" },
      { value: "El Paso", label: "El Paso" },
    ] },
    { value: "UT", label: "Utah", cities: [
      { value: "Salt Lake City", label: "Salt Lake City" },
      { value: "Provo", label: "Provo" },
      { value: "Ogden", label: "Ogden" },
      { value: "Park City", label: "Park City" },
    ] },
    { value: "VT", label: "Vermont", cities: [
      { value: "Burlington", label: "Burlington" },
      { value: "Montpelier", label: "Montpelier" },
      { value: "Rutland", label: "Rutland" },
    ] },
    { value: "VA", label: "Virginia", cities: [
      { value: "Richmond", label: "Richmond" },
      { value: "Virginia Beach", label: "Virginia Beach" },
      { value: "Arlington", label: "Arlington" },
      { value: "Norfolk", label: "Norfolk" },
      { value: "Alexandria", label: "Alexandria" },
    ] },
    { value: "WA", label: "Washington", cities: [
      { value: "Seattle", label: "Seattle" },
      { value: "Spokane", label: "Spokane" },
      { value: "Tacoma", label: "Tacoma" },
      { value: "Bellevue", label: "Bellevue" },
      { value: "Olympia", label: "Olympia" },
    ] },
    { value: "WV", label: "West Virginia", cities: [
      { value: "Charleston", label: "Charleston" },
      { value: "Morgantown", label: "Morgantown" },
      { value: "Huntington", label: "Huntington" },
    ] },
    { value: "WI", label: "Wisconsin", cities: [
      { value: "Milwaukee", label: "Milwaukee" },
      { value: "Madison", label: "Madison" },
      { value: "Green Bay", label: "Green Bay" },
      { value: "Kenosha", label: "Kenosha" },
    ] },
    { value: "WY", label: "Wyoming", cities: [
      { value: "Cheyenne", label: "Cheyenne" },
      { value: "Casper", label: "Casper" },
      { value: "Jackson", label: "Jackson" },
      { value: "Laramie", label: "Laramie" },
    ] },
  ],
  CN: [
    { value: "北京市", label: "北京市", cities: [
      { value: "东城区", label: "东城区" },
      { value: "西城区", label: "西城区" },
      { value: "朝阳区", label: "朝阳区" },
      { value: "海淀区", label: "海淀区" },
      { value: "丰台区", label: "丰台区" },
      { value: "通州区", label: "通州区" },
      { value: "大兴区", label: "大兴区" },
      { value: "昌平区", label: "昌平区" },
    ] },
    { value: "天津市", label: "天津市", cities: [
      { value: "和平区", label: "和平区" },
      { value: "河西区", label: "河西区" },
      { value: "南开区", label: "南开区" },
      { value: "滨海新区", label: "滨海新区" },
      { value: "武清区", label: "武清区" },
      { value: "宝坻区", label: "宝坻区" },
    ] },
    { value: "上海市", label: "上海市", cities: [
      { value: "黄浦区", label: "黄浦区" },
      { value: "徐汇区", label: "徐汇区" },
      { value: "静安区", label: "静安区" },
      { value: "浦东新区", label: "浦东新区" },
      { value: "闵行区", label: "闵行区" },
      { value: "长宁区", label: "长宁区" },
      { value: "宝山区", label: "宝山区" },
      { value: "嘉定区", label: "嘉定区" },
    ] },
    { value: "重庆市", label: "重庆市", cities: [
      { value: "渝中区", label: "渝中区" },
      { value: "江北区", label: "江北区" },
      { value: "南岸区", label: "南岸区" },
      { value: "九龙坡区", label: "九龙坡区" },
      { value: "渝北区", label: "渝北区" },
      { value: "沙坪坝区", label: "沙坪坝区" },
      { value: "两江新区", label: "两江新区" },
      { value: "万州区", label: "万州区" },
    ] },
    { value: "河北省", label: "河北省", cities: [
      { value: "石家庄市", label: "石家庄市" },
      { value: "唐山市", label: "唐山市" },
      { value: "秦皇岛市", label: "秦皇岛市" },
      { value: "邯郸市", label: "邯郸市" },
      { value: "保定市", label: "保定市" },
      { value: "廊坊市", label: "廊坊市" },
      { value: "沧州市", label: "沧州市" },
      { value: "邢台市", label: "邢台市" },
    ] },
    { value: "山西省", label: "山西省", cities: [
      { value: "太原市", label: "太原市" },
      { value: "大同市", label: "大同市" },
      { value: "阳泉市", label: "阳泉市" },
      { value: "长治市", label: "长治市" },
      { value: "晋城市", label: "晋城市" },
      { value: "临汾市", label: "临汾市" },
      { value: "运城市", label: "运城市" },
    ] },
    { value: "辽宁省", label: "辽宁省", cities: [
      { value: "沈阳市", label: "沈阳市" },
      { value: "大连市", label: "大连市" },
      { value: "鞍山市", label: "鞍山市" },
      { value: "抚顺市", label: "抚顺市" },
      { value: "营口市", label: "营口市" },
      { value: "锦州市", label: "锦州市" },
      { value: "丹东市", label: "丹东市" },
    ] },
    { value: "吉林省", label: "吉林省", cities: [
      { value: "长春市", label: "长春市" },
      { value: "吉林市", label: "吉林市" },
      { value: "四平市", label: "四平市" },
      { value: "松原市", label: "松原市" },
      { value: "白城市", label: "白城市" },
      { value: "延吉市", label: "延吉市" },
    ] },
    { value: "黑龙江省", label: "黑龙江省", cities: [
      { value: "哈尔滨市", label: "哈尔滨市" },
      { value: "齐齐哈尔市", label: "齐齐哈尔市" },
      { value: "牡丹江市", label: "牡丹江市" },
      { value: "佳木斯市", label: "佳木斯市" },
      { value: "大庆市", label: "大庆市" },
      { value: "绥化市", label: "绥化市" },
    ] },
    { value: "江苏省", label: "江苏省", cities: [
      { value: "南京市", label: "南京市" },
      { value: "无锡市", label: "无锡市" },
      { value: "徐州市", label: "徐州市" },
      { value: "常州市", label: "常州市" },
      { value: "苏州市", label: "苏州市" },
      { value: "南通市", label: "南通市" },
      { value: "扬州市", label: "扬州市" },
      { value: "镇江市", label: "镇江市" },
    ] },
    { value: "浙江省", label: "浙江省", cities: [
      { value: "杭州市", label: "杭州市" },
      { value: "宁波市", label: "宁波市" },
      { value: "温州市", label: "温州市" },
      { value: "嘉兴市", label: "嘉兴市" },
      { value: "湖州市", label: "湖州市" },
      { value: "绍兴市", label: "绍兴市" },
      { value: "金华市", label: "金华市" },
      { value: "台州市", label: "台州市" },
    ] },
    { value: "安徽省", label: "安徽省", cities: [
      { value: "合肥市", label: "合肥市" },
      { value: "芜湖市", label: "芜湖市" },
      { value: "蚌埠市", label: "蚌埠市" },
      { value: "淮南市", label: "淮南市" },
      { value: "马鞍山市", label: "马鞍山市" },
      { value: "安庆市", label: "安庆市" },
      { value: "阜阳市", label: "阜阳市" },
    ] },
    { value: "福建省", label: "福建省", cities: [
      { value: "福州市", label: "福州市" },
      { value: "厦门市", label: "厦门市" },
      { value: "莆田市", label: "莆田市" },
      { value: "三明市", label: "三明市" },
      { value: "泉州市", label: "泉州市" },
      { value: "漳州市", label: "漳州市" },
      { value: "南平市", label: "南平市" },
    ] },
    { value: "江西省", label: "江西省", cities: [
      { value: "南昌市", label: "南昌市" },
      { value: "景德镇市", label: "景德镇市" },
      { value: "九江市", label: "九江市" },
      { value: "鹰潭市", label: "鹰潭市" },
      { value: "赣州市", label: "赣州市" },
      { value: "宜春市", label: "宜春市" },
      { value: "上饶市", label: "上饶市" },
    ] },
    { value: "山东省", label: "山东省", cities: [
      { value: "济南市", label: "济南市" },
      { value: "青岛市", label: "青岛市" },
      { value: "淄博市", label: "淄博市" },
      { value: "枣庄市", label: "枣庄市" },
      { value: "烟台市", label: "烟台市" },
      { value: "潍坊市", label: "潍坊市" },
      { value: "济宁市", label: "济宁市" },
      { value: "临沂市", label: "临沂市" },
    ] },
    { value: "河南省", label: "河南省", cities: [
      { value: "郑州市", label: "郑州市" },
      { value: "开封市", label: "开封市" },
      { value: "洛阳市", label: "洛阳市" },
      { value: "新乡市", label: "新乡市" },
      { value: "安阳市", label: "安阳市" },
      { value: "南阳市", label: "南阳市" },
      { value: "商丘市", label: "商丘市" },
      { value: "许昌市", label: "许昌市" },
    ] },
    { value: "湖北省", label: "湖北省", cities: [
      { value: "武汉市", label: "武汉市" },
      { value: "黄石市", label: "黄石市" },
      { value: "十堰市", label: "十堰市" },
      { value: "宜昌市", label: "宜昌市" },
      { value: "襄阳市", label: "襄阳市" },
      { value: "荆州市", label: "荆州市" },
      { value: "孝感市", label: "孝感市" },
    ] },
    { value: "湖南省", label: "湖南省", cities: [
      { value: "长沙市", label: "长沙市" },
      { value: "株洲市", label: "株洲市" },
      { value: "湘潭市", label: "湘潭市" },
      { value: "衡阳市", label: "衡阳市" },
      { value: "邵阳市", label: "邵阳市" },
      { value: "常德市", label: "常德市" },
      { value: "郴州市", label: "郴州市" },
    ] },
    { value: "广东省", label: "广东省", cities: [
      { value: "广州市", label: "广州市" },
      { value: "深圳市", label: "深圳市" },
      { value: "珠海市", label: "珠海市" },
      { value: "佛山市", label: "佛山市" },
      { value: "东莞市", label: "东莞市" },
      { value: "中山市", label: "中山市" },
      { value: "惠州市", label: "惠州市" },
      { value: "韶关市", label: "韶关市" },
    ] },
    { value: "海南省", label: "海南省", cities: [
      { value: "海口市", label: "海口市" },
      { value: "三亚市", label: "三亚市" },
      { value: "三沙市", label: "三沙市" },
      { value: "儋州市", label: "儋州市" },
      { value: "文昌市", label: "文昌市" },
      { value: "琼海市", label: "琼海市" },
    ] },
    { value: "四川省", label: "四川省", cities: [
      { value: "成都市", label: "成都市" },
      { value: "自贡市", label: "自贡市" },
      { value: "攀枝花市", label: "攀枝花市" },
      { value: "泸州市", label: "泸州市" },
      { value: "德阳市", label: "德阳市" },
      { value: "绵阳市", label: "绵阳市" },
      { value: "乐山市", label: "乐山市" },
      { value: "宜宾市", label: "宜宾市" },
    ] },
    { value: "贵州省", label: "贵州省", cities: [
      { value: "贵阳市", label: "贵阳市" },
      { value: "六盘水市", label: "六盘水市" },
      { value: "遵义市", label: "遵义市" },
      { value: "安顺市", label: "安顺市" },
      { value: "毕节市", label: "毕节市" },
      { value: "铜仁市", label: "铜仁市" },
    ] },
    { value: "云南省", label: "云南省", cities: [
      { value: "昆明市", label: "昆明市" },
      { value: "曲靖市", label: "曲靖市" },
      { value: "玉溪市", label: "玉溪市" },
      { value: "保山市", label: "保山市" },
      { value: "丽江市", label: "丽江市" },
      { value: "普洱市", label: "普洱市" },
      { value: "大理市", label: "大理市" },
    ] },
    { value: "陕西省", label: "陕西省", cities: [
      { value: "西安市", label: "西安市" },
      { value: "铜川市", label: "铜川市" },
      { value: "宝鸡市", label: "宝鸡市" },
      { value: "咸阳市", label: "咸阳市" },
      { value: "渭南市", label: "渭南市" },
      { value: "汉中市", label: "汉中市" },
      { value: "榆林市", label: "榆林市" },
    ] },
    { value: "甘肃省", label: "甘肃省", cities: [
      { value: "兰州市", label: "兰州市" },
      { value: "嘉峪关市", label: "嘉峪关市" },
      { value: "金昌市", label: "金昌市" },
      { value: "天水市", label: "天水市" },
      { value: "武威市", label: "武威市" },
      { value: "酒泉市", label: "酒泉市" },
      { value: "庆阳市", label: "庆阳市" },
    ] },
    { value: "青海省", label: "青海省", cities: [
      { value: "西宁市", label: "西宁市" },
      { value: "海东市", label: "海东市" },
      { value: "格尔木市", label: "格尔木市" },
      { value: "德令哈市", label: "德令哈市" },
      { value: "玉树市", label: "玉树市" },
    ] },
    { value: "台湾省", label: "台湾省", cities: [
      { value: "台北市", label: "台北市" },
      { value: "新北市", label: "新北市" },
      { value: "桃园市", label: "桃园市" },
      { value: "台中市", label: "台中市" },
      { value: "台南市", label: "台南市" },
      { value: "高雄市", label: "高雄市" },
      { value: "新竹市", label: "新竹市" },
    ] },
    { value: "内蒙古自治区", label: "内蒙古自治区", cities: [
      { value: "呼和浩特市", label: "呼和浩特市" },
      { value: "包头市", label: "包头市" },
      { value: "乌海市", label: "乌海市" },
      { value: "赤峰市", label: "赤峰市" },
      { value: "通辽市", label: "通辽市" },
      { value: "鄂尔多斯市", label: "鄂尔多斯市" },
      { value: "呼伦贝尔市", label: "呼伦贝尔市" },
    ] },
    { value: "广西壮族自治区", label: "广西壮族自治区", cities: [
      { value: "南宁市", label: "南宁市" },
      { value: "柳州市", label: "柳州市" },
      { value: "桂林市", label: "桂林市" },
      { value: "梧州市", label: "梧州市" },
      { value: "北海市", label: "北海市" },
      { value: "防城港市", label: "防城港市" },
      { value: "玉林市", label: "玉林市" },
    ] },
    { value: "西藏自治区", label: "西藏自治区", cities: [
      { value: "拉萨市", label: "拉萨市" },
      { value: "日喀则市", label: "日喀则市" },
      { value: "昌都市", label: "昌都市" },
      { value: "林芝市", label: "林芝市" },
      { value: "山南市", label: "山南市" },
    ] },
    { value: "宁夏回族自治区", label: "宁夏回族自治区", cities: [
      { value: "银川市", label: "银川市" },
      { value: "石嘴山市", label: "石嘴山市" },
      { value: "吴忠市", label: "吴忠市" },
      { value: "固原市", label: "固原市" },
      { value: "中卫市", label: "中卫市" },
    ] },
    { value: "新疆维吾尔自治区", label: "新疆维吾尔自治区", cities: [
      { value: "乌鲁木齐市", label: "乌鲁木齐市" },
      { value: "克拉玛依市", label: "克拉玛依市" },
      { value: "吐鲁番市", label: "吐鲁番市" },
      { value: "哈密市", label: "哈密市" },
      { value: "昌吉市", label: "昌吉市" },
      { value: "喀什市", label: "喀什市" },
      { value: "伊宁市", label: "伊宁市" },
    ] },
    { value: "香港特别行政区", label: "香港特别行政区", cities: [
      { value: "中西区", label: "中西区" },
      { value: "湾仔区", label: "湾仔区" },
      { value: "东区", label: "东区" },
      { value: "油尖旺区", label: "油尖旺区" },
      { value: "深水埗区", label: "深水埗区" },
      { value: "九龙城区", label: "九龙城区" },
      { value: "观塘区", label: "观塘区" },
      { value: "荃湾区", label: "荃湾区" },
      { value: "沙田区", label: "沙田区" },
      { value: "元朗区", label: "元朗区" },
    ] },
    { value: "澳门特别行政区", label: "澳门特别行政区", cities: [
      { value: "花地玛堂区", label: "花地玛堂区" },
      { value: "圣安多尼堂区", label: "圣安多尼堂区" },
      { value: "大堂区", label: "大堂区" },
      { value: "望德堂区", label: "望德堂区" },
      { value: "风顺堂区", label: "风顺堂区" },
      { value: "嘉模堂区", label: "嘉模堂区" },
      { value: "圣方济各堂区", label: "圣方济各堂区" },
      { value: "路氹城", label: "路氹城" },
    ] },
  ],
  GB: [
    { value: "London", label: "大伦敦", cities: [
      { value: "London", label: "伦敦" },
    ] },
    { value: "South East", label: "东南英格兰", cities: [
      { value: "Brighton", label: "布莱顿" },
      { value: "Oxford", label: "牛津" },
      { value: "Southampton", label: "南安普敦" },
      { value: "Portsmouth", label: "朴茨茅斯" },
      { value: "Reading", label: "雷丁" },
    ] },
    { value: "East of England", label: "英格兰东部", cities: [
      { value: "Cambridge", label: "剑桥" },
      { value: "Norwich", label: "诺里奇" },
      { value: "Ipswich", label: "伊普斯威奇" },
      { value: "Luton", label: "卢顿" },
    ] },
    { value: "South West", label: "西南英格兰", cities: [
      { value: "Bristol", label: "布里斯托" },
      { value: "Plymouth", label: "普利茅斯" },
      { value: "Bournemouth", label: "伯恩茅斯" },
      { value: "Swindon", label: "斯温顿" },
      { value: "Bath", label: "巴斯" },
    ] },
    { value: "West Midlands", label: "西米德兰兹", cities: [
      { value: "Birmingham", label: "伯明翰" },
      { value: "Coventry", label: "考文垂" },
      { value: "Wolverhampton", label: "伍尔弗汉普顿" },
      { value: "Stoke-on-Trent", label: "斯托克" },
    ] },
    { value: "East Midlands", label: "东米德兰兹", cities: [
      { value: "Nottingham", label: "诺丁汉" },
      { value: "Leicester", label: "莱斯特" },
      { value: "Derby", label: "德比" },
    ] },
    { value: "North West", label: "西北英格兰", cities: [
      { value: "Manchester", label: "曼彻斯特" },
      { value: "Liverpool", label: "利物浦" },
      { value: "Preston", label: "普雷斯顿" },
      { value: "Blackpool", label: "布莱克浦" },
    ] },
    { value: "North East", label: "东北英格兰", cities: [
      { value: "Newcastle upon Tyne", label: "纽卡斯尔" },
      { value: "Sunderland", label: "桑德兰" },
      { value: "Middlesbrough", label: "米德尔斯堡" },
      { value: "Durham", label: "达勒姆" },
    ] },
    { value: "Yorkshire and the Humber", label: "约克郡-亨伯", cities: [
      { value: "Leeds", label: "利兹" },
      { value: "Sheffield", label: "谢菲尔德" },
      { value: "Bradford", label: "布拉德福德" },
      { value: "Hull", label: "赫尔" },
      { value: "York", label: "约克" },
    ] },
    { value: "Scotland", label: "苏格兰", cities: [
      { value: "Edinburgh", label: "爱丁堡" },
      { value: "Glasgow", label: "格拉斯哥" },
      { value: "Aberdeen", label: "阿伯丁" },
      { value: "Dundee", label: "邓迪" },
      { value: "Inverness", label: "因弗内斯" },
    ] },
    { value: "Wales", label: "威尔士", cities: [
      { value: "Cardiff", label: "卡迪夫" },
      { value: "Swansea", label: "斯旺西" },
      { value: "Newport", label: "纽波特" },
      { value: "Wrexham", label: "雷克瑟姆" },
    ] },
    { value: "Northern Ireland", label: "北爱尔兰", cities: [
      { value: "Belfast", label: "贝尔法斯特" },
      { value: "Derry", label: "德里" },
      { value: "Lisburn", label: "利斯本" },
    ] },
  ],
  DE: [
    { value: "Baden-Wurttemberg", label: "巴登-符腾堡州", cities: [
      { value: "Stuttgart", label: "斯图加特" },
      { value: "Mannheim", label: "曼海姆" },
      { value: "Karlsruhe", label: "卡尔斯鲁厄" },
      { value: "Freiburg", label: "弗莱堡" },
      { value: "Heidelberg", label: "海德堡" },
    ] },
    { value: "Bavaria", label: "巴伐利亚州", cities: [
      { value: "Munich", label: "慕尼黑" },
      { value: "Nuremberg", label: "纽伦堡" },
      { value: "Augsburg", label: "奥格斯堡" },
      { value: "Regensburg", label: "雷根斯堡" },
    ] },
    { value: "Berlin", label: "柏林", cities: [
      { value: "Berlin", label: "柏林" },
    ] },
    { value: "Brandenburg", label: "勃兰登堡州", cities: [
      { value: "Potsdam", label: "波茨坦" },
      { value: "Cottbus", label: "科特布斯" },
      { value: "Frankfurt (Oder)", label: "奥得河畔法兰克福" },
    ] },
    { value: "Bremen", label: "不来梅州", cities: [
      { value: "Bremen", label: "不来梅" },
      { value: "Bremerhaven", label: "不来梅港" },
    ] },
    { value: "Hamburg", label: "汉堡", cities: [
      { value: "Hamburg", label: "汉堡" },
    ] },
    { value: "Hesse", label: "黑森州", cities: [
      { value: "Frankfurt", label: "法兰克福" },
      { value: "Wiesbaden", label: "威斯巴登" },
      { value: "Kassel", label: "卡塞尔" },
      { value: "Darmstadt", label: "达姆施塔特" },
    ] },
    { value: "Lower Saxony", label: "下萨克森州", cities: [
      { value: "Hanover", label: "汉诺威" },
      { value: "Brunswick", label: "布伦瑞克" },
      { value: "Wolfsburg", label: "沃尔夫斯堡" },
      { value: "Oldenburg", label: "奥尔登堡" },
    ] },
    { value: "Mecklenburg-Vorpommern", label: "梅克伦堡-前波美拉尼亚州", cities: [
      { value: "Rostock", label: "罗斯托克" },
      { value: "Schwerin", label: "什未林" },
      { value: "Neubrandenburg", label: "新勃兰登堡" },
    ] },
    { value: "North Rhine-Westphalia", label: "北莱茵-威斯特法伦州", cities: [
      { value: "Cologne", label: "科隆" },
      { value: "Dusseldorf", label: "杜塞尔多夫" },
      { value: "Dortmund", label: "多特蒙德" },
      { value: "Essen", label: "埃森" },
      { value: "Bonn", label: "波恩" },
      { value: "Duisburg", label: "杜伊斯堡" },
    ] },
    { value: "Rhineland-Palatinate", label: "莱茵兰-普法尔茨州", cities: [
      { value: "Mainz", label: "美因茨" },
      { value: "Ludwigshafen", label: "路德维希港" },
      { value: "Koblenz", label: "科布伦茨" },
    ] },
    { value: "Saarland", label: "萨尔州", cities: [
      { value: "Saarbrucken", label: "萨尔布吕肯" },
      { value: "Neunkirchen", label: "诺因基兴" },
    ] },
    { value: "Saxony", label: "萨克森州", cities: [
      { value: "Dresden", label: "德累斯顿" },
      { value: "Leipzig", label: "莱比锡" },
      { value: "Chemnitz", label: "开姆尼茨" },
    ] },
    { value: "Saxony-Anhalt", label: "萨克森-安哈尔特州", cities: [
      { value: "Magdeburg", label: "马格德堡" },
      { value: "Halle", label: "哈勒" },
      { value: "Dessau", label: "德绍" },
    ] },
    { value: "Schleswig-Holstein", label: "石勒苏益格-荷尔斯泰因州", cities: [
      { value: "Kiel", label: "基尔" },
      { value: "Lubeck", label: "吕贝克" },
      { value: "Flensburg", label: "弗伦斯堡" },
    ] },
    { value: "Thuringia", label: "图林根州", cities: [
      { value: "Erfurt", label: "爱尔福特" },
      { value: "Jena", label: "耶拿" },
      { value: "Weimar", label: "魏玛" },
    ] },
  ],
  FR: [
    { value: "Auvergne-Rhone-Alpes", label: "奥弗涅-罗讷-阿尔卑斯大区", cities: [
      { value: "Lyon", label: "里昂" },
      { value: "Grenoble", label: "格勒诺布尔" },
      { value: "Clermont-Ferrand", label: "克莱蒙费朗" },
      { value: "Saint-Etienne", label: "圣艾蒂安" },
    ] },
    { value: "Bourgogne-Franche-Comte", label: "勃艮第-弗朗什-孔泰大区", cities: [
      { value: "Dijon", label: "第戎" },
      { value: "Besancon", label: "贝桑松" },
      { value: "Belfort", label: "贝尔福" },
    ] },
    { value: "Brittany", label: "布列塔尼大区", cities: [
      { value: "Rennes", label: "雷恩" },
      { value: "Brest", label: "布雷斯特" },
      { value: "Quimper", label: "坎佩尔" },
    ] },
    { value: "Centre-Val de Loire", label: "中央-卢瓦尔河谷大区", cities: [
      { value: "Orleans", label: "奥尔良" },
      { value: "Tours", label: "图尔" },
      { value: "Bourges", label: "布尔日" },
    ] },
    { value: "Corsica", label: "科西嘉", cities: [
      { value: "Ajaccio", label: "阿雅克肖" },
      { value: "Bastia", label: "巴斯蒂亚" },
    ] },
    { value: "Grand Est", label: "大东部大区", cities: [
      { value: "Strasbourg", label: "斯特拉斯堡" },
      { value: "Reims", label: "兰斯" },
      { value: "Metz", label: "梅斯" },
      { value: "Nancy", label: "南锡" },
    ] },
    { value: "Hauts-de-France", label: "上法兰西大区", cities: [
      { value: "Lille", label: "里尔" },
      { value: "Amiens", label: "亚眠" },
      { value: "Roubaix", label: "鲁贝" },
    ] },
    { value: "Ile-de-France", label: "法兰西岛大区", cities: [
      { value: "Paris", label: "巴黎" },
      { value: "Boulogne-Billancourt", label: "布洛涅-比扬古" },
      { value: "Saint-Denis", label: "圣但尼" },
      { value: "Versailles", label: "凡尔赛" },
    ] },
    { value: "Normandy", label: "诺曼底大区", cities: [
      { value: "Rouen", label: "鲁昂" },
      { value: "Caen", label: "卡昂" },
      { value: "Le Havre", label: "勒阿弗尔" },
    ] },
    { value: "Nouvelle-Aquitaine", label: "新阿基坦大区", cities: [
      { value: "Bordeaux", label: "波尔多" },
      { value: "Limoges", label: "利摩日" },
      { value: "Poitiers", label: "普瓦捷" },
      { value: "La Rochelle", label: "拉罗谢尔" },
    ] },
    { value: "Occitanie", label: "奥克西塔尼大区", cities: [
      { value: "Toulouse", label: "图卢兹" },
      { value: "Montpellier", label: "蒙彼利埃" },
      { value: "Nimes", label: "尼姆" },
    ] },
    { value: "Pays de la Loire", label: "卢瓦尔河地区大区", cities: [
      { value: "Nantes", label: "南特" },
      { value: "Angers", label: "昂热" },
      { value: "Le Mans", label: "勒芒" },
    ] },
    { value: "Provence-Alpes-Cote d'Azur", label: "普罗旺斯-阿尔卑斯-蓝色海岸大区", cities: [
      { value: "Marseille", label: "马赛" },
      { value: "Nice", label: "尼斯" },
      { value: "Toulon", label: "土伦" },
      { value: "Aix-en-Provence", label: "艾克斯" },
    ] },
  ],
  CA: [
    { value: "Ontario", label: "安大略省", cities: [
      { value: "Toronto", label: "多伦多" },
      { value: "Ottawa", label: "渥太华" },
      { value: "Mississauga", label: "密西沙加" },
      { value: "Hamilton", label: "汉密尔顿" },
      { value: "London", label: "伦敦" },
      { value: "Kitchener", label: "基奇纳" },
    ] },
    { value: "Quebec", label: "魁北克省", cities: [
      { value: "Montreal", label: "蒙特利尔" },
      { value: "Quebec City", label: "魁北克城" },
      { value: "Laval", label: "拉瓦尔" },
    ] },
    { value: "British Columbia", label: "不列颠哥伦比亚省", cities: [
      { value: "Vancouver", label: "温哥华" },
      { value: "Victoria", label: "维多利亚" },
      { value: "Surrey", label: "素里" },
      { value: "Burnaby", label: "本拿比" },
    ] },
    { value: "Alberta", label: "阿尔伯塔省", cities: [
      { value: "Calgary", label: "卡尔加里" },
      { value: "Edmonton", label: "埃德蒙顿" },
      { value: "Red Deer", label: "红鹿市" },
    ] },
    { value: "Manitoba", label: "马尼托巴省", cities: [
      { value: "Winnipeg", label: "温尼伯" },
      { value: "Brandon", label: "布兰登" },
    ] },
    { value: "Saskatchewan", label: "萨斯喀彻温省", cities: [
      { value: "Saskatoon", label: "萨斯卡通" },
      { value: "Regina", label: "里贾纳" },
      { value: "Prince Albert", label: "艾伯特亲王城" },
    ] },
    { value: "Nova Scotia", label: "新斯科舍省", cities: [
      { value: "Halifax", label: "哈利法克斯" },
      { value: "Sydney", label: "Sydney" },
      { value: "Dartmouth", label: "达特茅斯" },
    ] },
    { value: "New Brunswick", label: "新不伦瑞克省", cities: [
      { value: "Moncton", label: "蒙克顿" },
      { value: "Saint John", label: "圣约翰" },
      { value: "Fredericton", label: "弗雷德里克顿" },
    ] },
    { value: "Newfoundland and Labrador", label: "纽芬兰与拉布拉多省", cities: [
      { value: "St. John's", label: "圣约翰斯" },
      { value: "Corner Brook", label: "科纳布鲁克" },
      { value: "Mount Pearl", label: "珍珠山" },
    ] },
    { value: "Prince Edward Island", label: "爱德华王子岛省", cities: [
      { value: "Charlottetown", label: "夏洛特敦" },
      { value: "Summerside", label: "萨默赛德" },
      { value: "Stratford", label: "斯特拉特福" },
    ] },
    { value: "Northwest Territories", label: "西北地区", cities: [
      { value: "Yellowknife", label: "耶洛奈夫" },
    ] },
    { value: "Yukon", label: "育空地区", cities: [
      { value: "Whitehorse", label: "怀特霍斯" },
    ] },
    { value: "Nunavut", label: "努纳武特地区", cities: [
      { value: "Iqaluit", label: "伊魁特" },
    ] },
  ],
  AU: [
    { value: "New South Wales", label: "新南威尔士州", cities: [
      { value: "Sydney", label: "悉尼" },
      { value: "Newcastle", label: "纽卡斯尔" },
      { value: "Wollongong", label: "伍伦贡" },
    ] },
    { value: "Victoria", label: "维多利亚州", cities: [
      { value: "Melbourne", label: "墨尔本" },
      { value: "Geelong", label: "吉朗" },
      { value: "Ballarat", label: "巴拉瑞特" },
      { value: "Bendigo", label: "本迪戈" },
    ] },
    { value: "Queensland", label: "昆士兰州", cities: [
      { value: "Brisbane", label: "布里斯班" },
      { value: "Gold Coast", label: "黄金海岸" },
      { value: "Cairns", label: "凯恩斯" },
      { value: "Townsville", label: "汤斯维尔" },
    ] },
    { value: "Western Australia", label: "西澳大利亚州", cities: [
      { value: "Perth", label: "珀斯" },
      { value: "Fremantle", label: "弗里曼特尔" },
      { value: "Mandurah", label: "曼杜拉" },
      { value: "Bunbury", label: "班伯里" },
    ] },
    { value: "South Australia", label: "南澳大利亚州", cities: [
      { value: "Adelaide", label: "阿德莱德" },
      { value: "Mount Gambier", label: "甘比尔山" },
      { value: "Whyalla", label: "怀阿拉" },
    ] },
    { value: "Tasmania", label: "塔斯马尼亚州", cities: [
      { value: "Hobart", label: "霍巴特" },
      { value: "Launceston", label: "朗塞斯顿" },
      { value: "Devonport", label: "德文港" },
    ] },
    { value: "Australian Capital Territory", label: "澳大利亚首都领地", cities: [
      { value: "Canberra", label: "堪培拉" },
    ] },
    { value: "Northern Territory", label: "北领地", cities: [
      { value: "Darwin", label: "达尔文" },
      { value: "Alice Springs", label: "爱丽丝泉" },
      { value: "Katherine", label: "凯瑟琳" },
    ] },
  ],
  JP: [
    { value: "Hokkaido", label: "北海道", cities: [
      { value: "Sapporo", label: "札幌市" },
      { value: "Hakodate", label: "函馆市" },
      { value: "Asahikawa", label: "旭川市" },
      { value: "Otaru", label: "小樽市" },
      { value: "Kushiro", label: "钏路市" },
    ] },
    { value: "Aomori", label: "青森县", cities: [
      { value: "Aomori", label: "青森市" },
      { value: "Hachinohe", label: "八户市" },
      { value: "Hirosaki", label: "弘前市" },
    ] },
    { value: "Iwate", label: "岩手县", cities: [
      { value: "Morioka", label: "盛冈市" },
      { value: "Kitakami", label: "北上市" },
      { value: "Ichinoseki", label: "一关市" },
    ] },
    { value: "Miyagi", label: "宫城县", cities: [
      { value: "Sendai", label: "仙台市" },
      { value: "Ishinomaki", label: "石卷市" },
      { value: "Osaki", label: "大崎市" },
    ] },
    { value: "Akita", label: "秋田县", cities: [
      { value: "Akita", label: "秋田市" },
      { value: "Yokote", label: "横手市" },
      { value: "Odate", label: "大馆市" },
    ] },
    { value: "Yamagata", label: "山形县", cities: [
      { value: "Yamagata", label: "山形市" },
      { value: "Tsuruoka", label: "鹤冈市" },
      { value: "Sakata", label: "酒田市" },
    ] },
    { value: "Fukushima", label: "福岛县", cities: [
      { value: "Fukushima", label: "福岛市" },
      { value: "Koriyama", label: "郡山市" },
      { value: "Iwaki", label: "磐城市" },
    ] },
    { value: "Ibaraki", label: "茨城县", cities: [
      { value: "Mito", label: "水户市" },
      { value: "Tsukuba", label: "筑波市" },
      { value: "Hitachi", label: "日立市" },
    ] },
    { value: "Tochigi", label: "枥木县", cities: [
      { value: "Utsunomiya", label: "宇都宫市" },
      { value: "Oyama", label: "小山市" },
      { value: "Ashikaga", label: "足利市" },
    ] },
    { value: "Gunma", label: "群马县", cities: [
      { value: "Maebashi", label: "前桥市" },
      { value: "Takasaki", label: "高崎市" },
      { value: "Ota", label: "太田市" },
    ] },
    { value: "Saitama", label: "埼玉县", cities: [
      { value: "Saitama", label: "埼玉市" },
      { value: "Kawaguchi", label: "川口市" },
      { value: "Kawagoe", label: "川越市" },
    ] },
    { value: "Chiba", label: "千叶县", cities: [
      { value: "Chiba", label: "千叶市" },
      { value: "Funabashi", label: "船桥市" },
      { value: "Matsudo", label: "松户市" },
    ] },
    { value: "Tokyo", label: "东京都", cities: [
      { value: "Shinjuku", label: "新宿" },
      { value: "Shibuya", label: "涩谷" },
      { value: "Hachioji", label: "八王子" },
      { value: "Ikebukuro", label: "池袋" },
      { value: "Ueno", label: "上野" },
    ] },
    { value: "Kanagawa", label: "神奈川县", cities: [
      { value: "Yokohama", label: "横滨市" },
      { value: "Kawasaki", label: "川崎市" },
      { value: "Yokosuka", label: "横须贺市" },
    ] },
    { value: "Niigata", label: "新潟县", cities: [
      { value: "Niigata", label: "新潟市" },
      { value: "Nagaoka", label: "长冈市" },
      { value: "Joetsu", label: "上越市" },
    ] },
    { value: "Toyama", label: "富山县", cities: [
      { value: "Toyama", label: "富山市" },
      { value: "Takaoka", label: "高冈市" },
      { value: "Himi", label: "冰见市" },
    ] },
    { value: "Ishikawa", label: "石川县", cities: [
      { value: "Kanazawa", label: "金泽市" },
      { value: "Komatsu", label: "小松市" },
      { value: "Kaga", label: "加贺市" },
    ] },
    { value: "Fukui", label: "福井县", cities: [
      { value: "Fukui", label: "福井市" },
      { value: "Tsuruga", label: "敦贺市" },
    ] },
    { value: "Yamanashi", label: "山梨县", cities: [
      { value: "Kofu", label: "甲府市" },
      { value: "Fujiyoshida", label: "富士吉田市" },
    ] },
    { value: "Nagano", label: "长野县", cities: [
      { value: "Nagano", label: "长野市" },
      { value: "Matsumoto", label: "松本市" },
      { value: "Ueda", label: "上田市" },
    ] },
    { value: "Gifu", label: "岐阜县", cities: [
      { value: "Gifu", label: "岐阜市" },
      { value: "Ogaki", label: "大垣市" },
      { value: "Takayama", label: "高山市" },
    ] },
    { value: "Shizuoka", label: "静冈县", cities: [
      { value: "Shizuoka", label: "静冈市" },
      { value: "Hamamatsu", label: "滨松市" },
      { value: "Numazu", label: "沼津市" },
    ] },
    { value: "Aichi", label: "爱知县", cities: [
      { value: "Nagoya", label: "名古屋市" },
      { value: "Toyota", label: "丰田市" },
      { value: "Okazaki", label: "冈崎市" },
    ] },
    { value: "Mie", label: "三重县", cities: [
      { value: "Tsu", label: "津市" },
      { value: "Yokkaichi", label: "四日市市" },
      { value: "Ise", label: "伊势市" },
    ] },
    { value: "Shiga", label: "滋贺县", cities: [
      { value: "Otsu", label: "大津市" },
      { value: "Hikone", label: "彦根市" },
      { value: "Kusatsu", label: "草津市" },
    ] },
    { value: "Kyoto", label: "京都府", cities: [
      { value: "Kyoto", label: "京都市" },
      { value: "Uji", label: "宇治市" },
      { value: "Maizuru", label: "舞鹤市" },
    ] },
    { value: "Osaka", label: "大阪府", cities: [
      { value: "Osaka", label: "大阪市" },
      { value: "Sakai", label: "堺市" },
      { value: "Higashiosaka", label: "东大阪市" },
    ] },
    { value: "Hyogo", label: "兵库县", cities: [
      { value: "Kobe", label: "神户市" },
      { value: "Himeji", label: "姬路市" },
      { value: "Amagasaki", label: "尼崎市" },
    ] },
    { value: "Nara", label: "奈良县", cities: [
      { value: "Nara", label: "奈良市" },
      { value: "Kashihara", label: "橿原市" },
      { value: "Ikoma", label: "生驹市" },
    ] },
    { value: "Wakayama", label: "和歌山县", cities: [
      { value: "Wakayama", label: "和歌山市" },
      { value: "Tanabe", label: "田边市" },
      { value: "Shingu", label: "新宫市" },
    ] },
    { value: "Tottori", label: "鸟取县", cities: [
      { value: "Tottori", label: "鸟取市" },
      { value: "Yonago", label: "米子市" },
    ] },
    { value: "Shimane", label: "岛根县", cities: [
      { value: "Matsue", label: "松江市" },
      { value: "Izumo", label: "出云市" },
      { value: "Hamada", label: "滨田市" },
    ] },
    { value: "Okayama", label: "冈山县", cities: [
      { value: "Okayama", label: "冈山市" },
      { value: "Kurashiki", label: "仓敷市" },
      { value: "Tsuyama", label: "津山市" },
    ] },
    { value: "Hiroshima", label: "广岛县", cities: [
      { value: "Hiroshima", label: "广岛市" },
      { value: "Fukuyama", label: "福山市" },
      { value: "Kure", label: "吴市" },
    ] },
    { value: "Yamaguchi", label: "山口县", cities: [
      { value: "Yamaguchi", label: "山口市" },
      { value: "Shimonoseki", label: "下关市" },
      { value: "Ube", label: "宇部市" },
    ] },
    { value: "Tokushima", label: "德岛县", cities: [
      { value: "Tokushima", label: "德岛市" },
      { value: "Naruto", label: "鸣门市" },
    ] },
    { value: "Kagawa", label: "香川县", cities: [
      { value: "Takamatsu", label: "高松市" },
      { value: "Marugame", label: "丸龟市" },
    ] },
    { value: "Ehime", label: "爱媛县", cities: [
      { value: "Matsuyama", label: "松山市" },
      { value: "Imabari", label: "今治市" },
      { value: "Niihama", label: "新居滨市" },
    ] },
    { value: "Kochi", label: "高知县", cities: [
      { value: "Kochi", label: "高知市" },
      { value: "Nankoku", label: "南国市" },
    ] },
    { value: "Fukuoka", label: "福冈县", cities: [
      { value: "Fukuoka", label: "福冈市" },
      { value: "Kitakyushu", label: "北九州市" },
      { value: "Kurume", label: "久留米市" },
    ] },
    { value: "Saga", label: "佐贺县", cities: [
      { value: "Saga", label: "佐贺市" },
      { value: "Karatsu", label: "唐津市" },
    ] },
    { value: "Nagasaki", label: "长崎县", cities: [
      { value: "Nagasaki", label: "长崎市" },
      { value: "Sasebo", label: "佐世保市" },
    ] },
    { value: "Kumamoto", label: "熊本县", cities: [
      { value: "Kumamoto", label: "熊本市" },
      { value: "Yatsushiro", label: "八代市" },
    ] },
    { value: "Oita", label: "大分县", cities: [
      { value: "Oita", label: "大分市" },
      { value: "Beppu", label: "别府市" },
    ] },
    { value: "Miyazaki", label: "宫崎县", cities: [
      { value: "Miyazaki", label: "宫崎市" },
      { value: "Miyakonojo", label: "都城市" },
    ] },
    { value: "Kagoshima", label: "鹿儿岛县", cities: [
      { value: "Kagoshima", label: "鹿儿岛市" },
      { value: "Kirishima", label: "雾岛市" },
    ] },
    { value: "Okinawa", label: "冲绳县", cities: [
      { value: "Naha", label: "那霸市" },
      { value: "Okinawa", label: "冲绳市" },
      { value: "Uruma", label: "宇流麻市" },
    ] },
  ],
  KR: [
    { value: "Seoul", label: "首尔特别市", cities: [
      { value: "Gangnam", label: "江南区" },
      { value: "Myeongdong", label: "明洞" },
      { value: "Hongdae", label: "弘大" },
      { value: "Jamsil", label: "蚕室" },
    ] },
    { value: "Busan", label: "釜山广域市", cities: [
      { value: "Haeundae", label: "海云台" },
      { value: "Seomyeon", label: "西面" },
      { value: "Nampo", label: "南浦洞" },
    ] },
    { value: "Incheon", label: "仁川广域市", cities: [
      { value: "Songdo", label: "松岛" },
      { value: "Bupyeong", label: "富平" },
      { value: "Yeonsu", label: "延寿区" },
    ] },
    { value: "Daegu", label: "大邱广域市", cities: [
      { value: "Dongseong-ro", label: "东城路商圈" },
      { value: "Suseong", label: "寿城区" },
      { value: "Dalseo", label: "达西区" },
    ] },
    { value: "Daejeon", label: "大田广域市", cities: [
      { value: "Yuseong", label: "儒城区" },
      { value: "Seo", label: "西区" },
      { value: "Jung", label: "中区" },
    ] },
    { value: "Gwangju", label: "光州广域市", cities: [
      { value: "Dong", label: "东区" },
      { value: "Seo", label: "西区" },
      { value: "Buk", label: "北区" },
    ] },
    { value: "Ulsan", label: "蔚山广域市", cities: [
      { value: "Nam", label: "南区" },
      { value: "Jung", label: "中区" },
      { value: "Buk", label: "北区" },
    ] },
    { value: "Sejong", label: "世宗特别自治市", cities: [
      { value: "Jochiwon", label: "鸟致院" },
      { value: "Hansol", label: "韩率洞" },
      { value: "Naseong", label: "罗城洞" },
    ] },
    { value: "Gyeonggi", label: "京畿道", cities: [
      { value: "Suwon", label: "水原市" },
      { value: "Seongnam", label: "城南市" },
      { value: "Goyang", label: "高阳市" },
      { value: "Yongin", label: "龙仁市" },
      { value: "Bucheon", label: "富川市" },
    ] },
    { value: "Gangwon", label: "江原特别自治道", cities: [
      { value: "Chuncheon", label: "春川市" },
      { value: "Sokcho", label: "束草市" },
      { value: "Wonju", label: "原州市" },
      { value: "Gangneung", label: "江陵市" },
    ] },
    { value: "Chungbuk", label: "忠清北道", cities: [
      { value: "Cheongju", label: "清州市" },
      { value: "Chungju", label: "忠州市" },
      { value: "Jecheon", label: "堤川市" },
    ] },
    { value: "Chungnam", label: "忠清南道", cities: [
      { value: "Cheonan", label: "天安市" },
      { value: "Asan", label: "牙山市" },
      { value: "Seosan", label: "瑞山市" },
    ] },
    { value: "Jeonbuk", label: "全北特别自治道", cities: [
      { value: "Jeonju", label: "全州市" },
      { value: "Iksan", label: "益山市" },
      { value: "Gunsan", label: "群山市" },
    ] },
    { value: "Jeonnam", label: "全罗南道", cities: [
      { value: "Yeosu", label: "丽水市" },
      { value: "Mokpo", label: "木浦市" },
      { value: "Suncheon", label: "顺天市" },
    ] },
    { value: "Gyeongbuk", label: "庆尚北道", cities: [
      { value: "Gyeongju", label: "庆州市" },
      { value: "Pohang", label: "浦项市" },
      { value: "Gumi", label: "龟尾市" },
    ] },
    { value: "Gyeongnam", label: "庆尚南道", cities: [
      { value: "Changwon", label: "昌原市" },
      { value: "Gimhae", label: "金海市" },
      { value: "Jinju", label: "晋州市" },
    ] },
    { value: "Jeju", label: "济州特别自治道", cities: [
      { value: "Jeju City", label: "济州市" },
      { value: "Seogwipo", label: "西归浦市" },
    ] },
  ],
  IN: [
    { value: "Maharashtra", label: "马哈拉施特拉邦", cities: [
      { value: "Mumbai", label: "孟买" },
      { value: "Pune", label: "浦那" },
      { value: "Nagpur", label: "那格浦尔" },
    ] },
    { value: "Delhi", label: "德里国家首都辖区", cities: [
      { value: "New Delhi", label: "新德里" },
      { value: "Connaught Place", label: "康诺特广场" },
      { value: "Dwarka", label: "德瓦卡" },
    ] },
    { value: "Karnataka", label: "卡纳塔克邦", cities: [
      { value: "Bengaluru", label: "班加罗尔" },
      { value: "Mysuru", label: "迈索尔" },
      { value: "Mangaluru", label: "门格洛尔" },
    ] },
    { value: "Tamil Nadu", label: "泰米尔纳德邦", cities: [
      { value: "Chennai", label: "金奈" },
      { value: "Coimbatore", label: "哥印拜陀" },
      { value: "Madurai", label: "马杜赖" },
    ] },
    { value: "Telangana", label: "特伦甘纳邦", cities: [
      { value: "Hyderabad", label: "海得拉巴" },
      { value: "Warangal", label: "瓦朗加尔" },
    ] },
    { value: "West Bengal", label: "西孟加拉邦", cities: [
      { value: "Kolkata", label: "加尔各答" },
      { value: "Howrah", label: "豪拉" },
      { value: "Durgapur", label: "杜尔加布尔" },
    ] },
    { value: "Gujarat", label: "古吉拉特邦", cities: [
      { value: "Ahmedabad", label: "艾哈迈达巴德" },
      { value: "Surat", label: "苏拉特" },
      { value: "Vadodara", label: "巴罗达" },
    ] },
    { value: "Rajasthan", label: "拉贾斯坦邦", cities: [
      { value: "Jaipur", label: "斋浦尔" },
      { value: "Udaipur", label: "乌代布尔" },
      { value: "Jodhpur", label: "焦特布尔" },
    ] },
    { value: "Uttar Pradesh", label: "北方邦", cities: [
      { value: "Lucknow", label: "勒克瑙" },
      { value: "Kanpur", label: "坎普尔" },
      { value: "Agra", label: "阿格拉" },
      { value: "Varanasi", label: "瓦拉纳西" },
    ] },
    { value: "Punjab", label: "旁遮普邦", cities: [
      { value: "Ludhiana", label: "卢迪亚纳" },
      { value: "Amritsar", label: "阿姆利则" },
      { value: "Jalandhar", label: "贾朗达尔" },
    ] },
    { value: "Haryana", label: "哈里亚纳邦", cities: [
      { value: "Gurugram", label: "古鲁格拉姆" },
      { value: "Faridabad", label: "法里达巴德" },
      { value: "Panipat", label: "帕尼帕特" },
    ] },
    { value: "Madhya Pradesh", label: "中央邦", cities: [
      { value: "Bhopal", label: "博帕尔" },
      { value: "Indore", label: "印多尔" },
      { value: "Gwalior", label: "瓜廖尔" },
    ] },
    { value: "Bihar", label: "比哈尔邦", cities: [
      { value: "Patna", label: "巴特那" },
      { value: "Gaya", label: "加雅" },
    ] },
    { value: "Kerala", label: "喀拉拉邦", cities: [
      { value: "Kochi", label: "科钦" },
      { value: "Thiruvananthapuram", label: "特里凡得琅" },
      { value: "Kozhikode", label: "科泽科德" },
    ] },
    { value: "Andhra Pradesh", label: "安得拉邦", cities: [
      { value: "Visakhapatnam", label: "维沙卡帕特南" },
      { value: "Vijayawada", label: "维杰亚瓦达" },
      { value: "Guntur", label: "贡土尔" },
    ] },
    { value: "Odisha", label: "奥里萨邦", cities: [
      { value: "Bhubaneswar", label: "布巴内什瓦尔" },
      { value: "Cuttack", label: "克塔克" },
      { value: "Rourkela", label: "鲁尔克拉" },
    ] },
    { value: "Assam", label: "阿萨姆邦", cities: [
      { value: "Guwahati", label: "古瓦哈蒂" },
      { value: "Dibrugarh", label: "迪布鲁加尔" },
    ] },
    { value: "Jharkhand", label: "贾坎德邦", cities: [
      { value: "Ranchi", label: "兰契" },
      { value: "Jamshedpur", label: "贾姆谢德布尔" },
      { value: "Dhanbad", label: "丹巴德" },
    ] },
    { value: "Chhattisgarh", label: "恰蒂斯加尔邦", cities: [
      { value: "Raipur", label: "赖布尔" },
      { value: "Bhilai", label: "比莱" },
    ] },
    { value: "Uttarakhand", label: "北阿坎德邦", cities: [
      { value: "Dehradun", label: "德拉敦" },
      { value: "Haridwar", label: "哈里德瓦" },
    ] },
    { value: "Himachal Pradesh", label: "喜马偕尔邦", cities: [
      { value: "Shimla", label: "西姆拉" },
      { value: "Dharamshala", label: "达兰萨拉" },
    ] },
    { value: "Goa", label: "果阿邦", cities: [
      { value: "Panaji", label: "帕纳吉" },
      { value: "Margao", label: "马尔冈" },
      { value: "Vasco da Gama", label: "瓦斯科达伽马" },
    ] },
    { value: "Jammu and Kashmir", label: "查谟和克什米尔", cities: [
      { value: "Srinagar", label: "斯利那加" },
      { value: "Jammu", label: "查谟" },
    ] },
  ],
  BR: [
    { value: "Sao Paulo", label: "圣保罗州", cities: [
      { value: "Sao Paulo", label: "圣保罗" },
      { value: "Campinas", label: "坎皮纳斯" },
      { value: "Santos", label: "桑托斯" },
      { value: "Guarulhos", label: "瓜鲁柳斯" },
    ] },
    { value: "Rio de Janeiro", label: "里约热内卢州", cities: [
      { value: "Rio de Janeiro", label: "里约热内卢" },
      { value: "Niteroi", label: "尼泰罗伊" },
      { value: "Sao Goncalo", label: "圣贡萨洛" },
    ] },
    { value: "Minas Gerais", label: "米纳斯吉拉斯州", cities: [
      { value: "Belo Horizonte", label: "贝洛奥里藏特" },
      { value: "Contagem", label: "孔塔任" },
      { value: "Uberlandia", label: "乌贝兰迪亚" },
      { value: "Juiz de Fora", label: "茹伊斯迪福拉" },
    ] },
    { value: "Bahia", label: "巴伊亚州", cities: [
      { value: "Salvador", label: "萨尔瓦多" },
      { value: "Feira de Santana", label: "费拉迪圣安娜" },
      { value: "Vitoria da Conquista", label: "维多利亚-达孔基斯塔" },
    ] },
    { value: "Parana", label: "巴拉那州", cities: [
      { value: "Curitiba", label: "库里蒂巴" },
      { value: "Londrina", label: "隆德里纳" },
      { value: "Maringa", label: "马林加" },
    ] },
    { value: "Rio Grande do Sul", label: "南里奥格兰德州", cities: [
      { value: "Porto Alegre", label: "阿雷格里港" },
      { value: "Caxias do Sul", label: "南卡希亚斯" },
      { value: "Canoas", label: "卡诺阿斯" },
    ] },
    { value: "Pernambuco", label: "伯南布哥州", cities: [
      { value: "Recife", label: "累西腓" },
      { value: "Jaboatao dos Guararapes", label: "雅博阿唐" },
      { value: "Olinda", label: "奥林达" },
    ] },
    { value: "Ceara", label: "塞阿拉州", cities: [
      { value: "Fortaleza", label: "福塔莱萨" },
      { value: "Caucaia", label: "考卡亚" },
      { value: "Juazeiro do Norte", label: "北茹阿泽鲁" },
    ] },
    { value: "Para", label: "帕拉州", cities: [
      { value: "Belem", label: "贝伦" },
      { value: "Ananindeua", label: "阿纳宁德瓦" },
      { value: "Santarem", label: "圣塔伦" },
    ] },
    { value: "Santa Catarina", label: "圣卡塔琳娜州", cities: [
      { value: "Florianopolis", label: "弗洛里亚诺波利斯" },
      { value: "Joinville", label: "若因维利" },
      { value: "Blumenau", label: "布卢梅瑙" },
    ] },
    { value: "Goias", label: "戈亚斯州", cities: [
      { value: "Goiania", label: "戈亚尼亚" },
      { value: "Aparecida de Goiania", label: "Aparecida de Goiania" },
      { value: "Anapolis", label: "阿纳波利斯" },
    ] },
    { value: "Maranhao", label: "马拉尼昂州", cities: [
      { value: "Sao Luis", label: "圣路易斯" },
      { value: "Imperatriz", label: "因佩拉特里斯" },
      { value: "Sao Jose de Ribamar", label: "Sao Jose de Ribamar" },
    ] },
    { value: "Amazonas", label: "亚马孙州", cities: [
      { value: "Manaus", label: "马瑙斯" },
      { value: "Parintins", label: "帕林廷斯" },
      { value: "Itacoatiara", label: "Itacoatiara" },
    ] },
    { value: "Espirito Santo", label: "圣埃斯皮里图州", cities: [
      { value: "Vitoria", label: "维多利亚" },
      { value: "Serra", label: "Serra" },
      { value: "Vila Velha", label: "Vila Velha" },
    ] },
    { value: "Paraiba", label: "帕拉伊巴州", cities: [
      { value: "Joao Pessoa", label: "若昂佩索阿" },
      { value: "Campina Grande", label: "坎皮纳格兰德" },
      { value: "Santa Rita", label: "Santa Rita" },
    ] },
    { value: "Mato Grosso", label: "马托格罗索州", cities: [
      { value: "Cuiaba", label: "库亚巴" },
      { value: "Varzea Grande", label: "Varzea Grande" },
      { value: "Rondonopolis", label: "Rondonopolis" },
    ] },
    { value: "Rio Grande do Norte", label: "北里奥格兰德州", cities: [
      { value: "Natal", label: "纳塔尔" },
      { value: "Mossoro", label: "莫索罗" },
      { value: "Parnamirim", label: "Parnamirim" },
    ] },
    { value: "Alagoas", label: "阿拉戈斯州", cities: [
      { value: "Maceio", label: "马塞约" },
      { value: "Arapiraca", label: "阿拉皮拉卡" },
      { value: "Rio Largo", label: "Rio Largo" },
    ] },
    { value: "Piaui", label: "皮奥伊州", cities: [
      { value: "Teresina", label: "特雷西纳" },
      { value: "Parnaiba", label: "帕纳伊巴" },
      { value: "Picos", label: "Picos" },
    ] },
    { value: "Distrito Federal", label: "联邦区", cities: [
      { value: "Brasilia", label: "巴西利亚" },
      { value: "Taguatinga", label: "Taguatinga" },
      { value: "Ceilandia", label: "Ceilandia" },
    ] },
    { value: "Mato Grosso do Sul", label: "南马托格罗索州", cities: [
      { value: "Campo Grande", label: "大坎普" },
      { value: "Dourados", label: "杜拉杜斯" },
      { value: "Corumba", label: "科伦巴" },
    ] },
    { value: "Sergipe", label: "塞尔希培州", cities: [
      { value: "Aracaju", label: "阿拉卡茹" },
      { value: "Nossa Senhora do Socorro", label: "Nossa Senhora do Socorro" },
      { value: "Lagarto", label: "Lagarto" },
    ] },
    { value: "Rondonia", label: "朗多尼亚州", cities: [
      { value: "Porto Velho", label: "韦柳港" },
      { value: "Ji-Parana", label: "日巴拉那" },
      { value: "Ariquemes", label: "Ariquemes" },
    ] },
    { value: "Tocantins", label: "托坎廷斯州", cities: [
      { value: "Palmas", label: "帕尔马斯" },
      { value: "Araguaina", label: "阿拉瓜伊纳" },
      { value: "Gurupi", label: "Gurupi" },
    ] },
    { value: "Acre", label: "阿克里州", cities: [
      { value: "Rio Branco", label: "里约布兰科" },
      { value: "Cruzeiro do Sul", label: "Cruzeiro do Sul" },
      { value: "Sena Madureira", label: "Sena Madureira" },
    ] },
    { value: "Amapa", label: "阿马帕州", cities: [
      { value: "Macapa", label: "马卡帕" },
      { value: "Santana", label: "Santana" },
      { value: "Laranjal do Jari", label: "Laranjal do Jari" },
    ] },
    { value: "Roraima", label: "罗赖马州", cities: [
      { value: "Boa Vista", label: "博阿维斯塔" },
      { value: "Rorainopolis", label: "Rorainopolis" },
    ] },
  ],
  MX: [
    { value: "Mexico City", label: "墨西哥城", cities: [
      { value: "Mexico City", label: "墨西哥城" },
    ] },
    { value: "Jalisco", label: "哈利斯科州", cities: [
      { value: "Guadalajara", label: "瓜达拉哈拉" },
      { value: "Zapopan", label: "萨波潘" },
      { value: "Tlaquepaque", label: "特拉克帕克" },
    ] },
    { value: "Nuevo Leon", label: "新莱昂州", cities: [
      { value: "Monterrey", label: "蒙特雷" },
      { value: "Guadalupe", label: "瓜达卢佩" },
      { value: "San Nicolas de los Garza", label: "圣尼古拉斯" },
    ] },
    { value: "Puebla", label: "普埃布拉州", cities: [
      { value: "Puebla", label: "普埃布拉" },
      { value: "Tehuacan", label: "特瓦坎" },
      { value: "Cholula", label: "乔卢拉" },
    ] },
    { value: "Guanajuato", label: "瓜纳华托州", cities: [
      { value: "Leon", label: "莱昂" },
      { value: "Guanajuato", label: "瓜纳华托" },
      { value: "Irapuato", label: "伊拉普阿托" },
    ] },
    { value: "Yucatan", label: "尤卡坦州", cities: [
      { value: "Merida", label: "梅里达" },
      { value: "Valladolid", label: "巴亚多利德" },
      { value: "Tizimin", label: "Tizimin" },
    ] },
    { value: "Quintana Roo", label: "金塔纳罗奥州", cities: [
      { value: "Cancun", label: "坎昆" },
      { value: "Playa del Carmen", label: "普拉亚德尔卡曼" },
      { value: "Tulum", label: "图卢姆" },
    ] },
    { value: "Baja California", label: "下加利福尼亚州", cities: [
      { value: "Tijuana", label: "蒂华纳" },
      { value: "Mexicali", label: "墨西卡利" },
      { value: "Ensenada", label: "恩塞纳达" },
    ] },
    { value: "Chihuahua", label: "奇瓦瓦州", cities: [
      { value: "Chihuahua", label: "奇瓦瓦" },
      { value: "Ciudad Juarez", label: "华雷斯城" },
      { value: "Delicias", label: "德利西亚斯" },
    ] },
    { value: "Veracruz", label: "韦拉克鲁斯州", cities: [
      { value: "Veracruz", label: "韦拉克鲁斯" },
      { value: "Xalapa", label: "哈拉帕" },
      { value: "Coatzacoalcos", label: "夸察夸尔科斯" },
    ] },
    { value: "Oaxaca", label: "瓦哈卡州", cities: [
      { value: "Oaxaca", label: "瓦哈卡" },
      { value: "Juchitan", label: "胡奇坦" },
      { value: "Salina Cruz", label: "Salina Cruz" },
    ] },
    { value: "Chiapas", label: "恰帕斯州", cities: [
      { value: "Tuxtla Gutierrez", label: "图斯特拉-古铁雷斯" },
      { value: "Tapachula", label: "塔帕丘拉" },
      { value: "San Cristobal de las Casas", label: "圣克里斯托瓦尔" },
    ] },
    { value: "Michoacan", label: "米却肯州", cities: [
      { value: "Morelia", label: "莫雷利亚" },
      { value: "Uruapan", label: "乌鲁阿潘" },
      { value: "Zamora", label: "萨莫拉" },
    ] },
    { value: "Queretaro", label: "克雷塔罗州", cities: [
      { value: "Queretaro", label: "克雷塔罗" },
      { value: "San Juan del Rio", label: "里奥圣胡安" },
      { value: "El Marques", label: "El Marques" },
    ] },
    { value: "San Luis Potosi", label: "圣路易斯波托西州", cities: [
      { value: "San Luis Potosi", label: "圣路易斯波托西" },
      { value: "Soledad de Graciano Sanchez", label: "Soledad de Graciano Sanchez" },
      { value: "Ciudad Valles", label: "巴列斯城" },
    ] },
    { value: "Sonora", label: "索诺拉州", cities: [
      { value: "Hermosillo", label: "埃莫西约" },
      { value: "Ciudad Obregon", label: "奥夫雷贡城" },
      { value: "Nogales", label: "诺加莱斯" },
    ] },
    { value: "Coahuila", label: "科阿韦拉州", cities: [
      { value: "Saltillo", label: "萨尔蒂约" },
      { value: "Torreon", label: "托雷翁" },
      { value: "Monclova", label: "蒙克洛瓦" },
    ] },
    { value: "Tamaulipas", label: "塔毛利帕斯州", cities: [
      { value: "Reynosa", label: "雷诺萨" },
      { value: "Tampico", label: "坦皮科" },
      { value: "Ciudad Victoria", label: "维多利亚城" },
    ] },
    { value: "Tabasco", label: "塔巴斯科州", cities: [
      { value: "Villahermosa", label: "比亚埃尔莫萨" },
      { value: "Cardenas", label: "卡德纳斯" },
      { value: "Comalcalco", label: "Comalcalco" },
    ] },
    { value: "Guerrero", label: "格雷罗州", cities: [
      { value: "Acapulco", label: "阿卡普尔科" },
      { value: "Chilpancingo", label: "奇尔潘辛戈" },
      { value: "Iguala", label: "伊瓜拉" },
    ] },
    { value: "Hidalgo", label: "伊达尔戈州", cities: [
      { value: "Pachuca", label: "帕丘卡" },
      { value: "Tulancingo", label: "图兰辛戈" },
      { value: "Tula", label: "图拉" },
    ] },
    { value: "Morelos", label: "莫雷洛斯州", cities: [
      { value: "Cuernavaca", label: "库埃纳瓦卡" },
      { value: "Jiutepec", label: "Jiutepec" },
      { value: "Cuautla", label: "夸乌特拉" },
    ] },
    { value: "Tlaxcala", label: "特拉斯卡拉州", cities: [
      { value: "Tlaxcala", label: "特拉斯卡拉" },
      { value: "Huamantla", label: "Huamantla" },
      { value: "Apizaco", label: "Apizaco" },
    ] },
    { value: "Nayarit", label: "纳亚里特州", cities: [
      { value: "Tepic", label: "特皮克" },
      { value: "Santiago Ixcuintla", label: "Santiago Ixcuintla" },
      { value: "Compostela", label: "Compostela" },
    ] },
    { value: "Campeche", label: "坎佩切州", cities: [
      { value: "Campeche", label: "坎佩切" },
      { value: "Ciudad del Carmen", label: "卡门城" },
      { value: "Champoton", label: "Champoton" },
    ] },
    { value: "Durango", label: "杜兰戈州", cities: [
      { value: "Durango", label: "杜兰戈" },
      { value: "Gomez Palacio", label: "戈麦斯帕拉西奥" },
      { value: "Ciudad Lerdo", label: "莱尔多城" },
    ] },
    { value: "Zacatecas", label: "萨卡特卡斯州", cities: [
      { value: "Zacatecas", label: "萨卡特卡斯" },
      { value: "Fresnillo", label: "弗雷斯尼约" },
      { value: "Guadalupe", label: "瓜达卢佩" },
    ] },
    { value: "Aguascalientes", label: "阿瓜斯卡连特斯州", cities: [
      { value: "Aguascalientes", label: "阿瓜斯卡连特斯" },
      { value: "Jesus Maria", label: "Jesus Maria" },
      { value: "Calvillo", label: "Calvillo" },
    ] },
    { value: "Colima", label: "科利马州", cities: [
      { value: "Colima", label: "科利马" },
      { value: "Manzanillo", label: "曼萨尼约" },
      { value: "Tecoman", label: "Tecoman" },
    ] },
    { value: "Baja California Sur", label: "南下加利福尼亚州", cities: [
      { value: "La Paz", label: "拉巴斯" },
      { value: "Los Cabos", label: "洛斯卡沃斯" },
      { value: "Loreto", label: "洛雷托" },
    ] },
    { value: "Sinaloa", label: "锡那罗亚州", cities: [
      { value: "Culiacan", label: "库利亚坎" },
      { value: "Mazatlan", label: "马萨特兰" },
      { value: "Los Mochis", label: "洛斯莫奇斯" },
    ] },
    { value: "State of Mexico", label: "墨西哥州", cities: [
      { value: "Toluca", label: "托卢卡" },
      { value: "Ecatepec", label: "埃卡特佩克" },
      { value: "Naucalpan", label: "瑙卡尔潘" },
    ] },
  ],
  IT: [
    { value: "Lombardy", label: "伦巴第大区", cities: [
      { value: "Milan", label: "米兰" },
      { value: "Bergamo", label: "贝加莫" },
      { value: "Brescia", label: "布雷西亚" },
      { value: "Como", label: "科莫" },
      { value: "Monza", label: "蒙扎" },
      { value: "Pavia", label: "帕维亚" },
    ] },
    { value: "Lazio", label: "拉齐奥大区", cities: [
      { value: "Rome", label: "罗马" },
      { value: "Latina", label: "拉蒂纳" },
      { value: "Viterbo", label: "维泰博" },
      { value: "Frosinone", label: "弗罗西诺内" },
    ] },
    { value: "Campania", label: "坎帕尼亚大区", cities: [
      { value: "Naples", label: "那不勒斯" },
      { value: "Salerno", label: "萨莱诺" },
      { value: "Caserta", label: "卡塞塔" },
      { value: "Avellino", label: "阿韦利诺" },
    ] },
    { value: "Sicily", label: "西西里大区", cities: [
      { value: "Palermo", label: "巴勒莫" },
      { value: "Catania", label: "卡塔尼亚" },
      { value: "Messina", label: "墨西拿" },
      { value: "Syracuse", label: "锡拉库萨" },
    ] },
    { value: "Veneto", label: "威尼托大区", cities: [
      { value: "Venice", label: "威尼斯" },
      { value: "Verona", label: "维罗纳" },
      { value: "Padua", label: "帕多瓦" },
      { value: "Vicenza", label: "维琴察" },
      { value: "Treviso", label: "特雷维索" },
    ] },
    { value: "Emilia-Romagna", label: "艾米利亚-罗马涅大区", cities: [
      { value: "Bologna", label: "博洛尼亚" },
      { value: "Modena", label: "摩德纳" },
      { value: "Parma", label: "帕尔马" },
      { value: "Reggio Emilia", label: "雷焦艾米利亚" },
      { value: "Ravenna", label: "拉文纳" },
    ] },
    { value: "Piedmont", label: "皮埃蒙特大区", cities: [
      { value: "Turin", label: "都灵" },
      { value: "Alessandria", label: "亚历山德里亚" },
      { value: "Novara", label: "诺瓦拉" },
      { value: "Cuneo", label: "库内奥" },
    ] },
    { value: "Apulia", label: "普利亚大区", cities: [
      { value: "Bari", label: "巴里" },
      { value: "Lecce", label: "莱切" },
      { value: "Taranto", label: "塔兰托" },
      { value: "Foggia", label: "福贾" },
    ] },
    { value: "Tuscany", label: "托斯卡纳大区", cities: [
      { value: "Florence", label: "佛罗伦萨" },
      { value: "Pisa", label: "比萨" },
      { value: "Siena", label: "锡耶纳" },
      { value: "Livorno", label: "利沃诺" },
    ] },
    { value: "Calabria", label: "卡拉布里亚大区", cities: [
      { value: "Reggio Calabria", label: "雷焦卡拉布里亚" },
      { value: "Catanzaro", label: "卡坦扎罗" },
      { value: "Cosenza", label: "科森扎" },
    ] },
    { value: "Sardinia", label: "撒丁大区", cities: [
      { value: "Cagliari", label: "卡利亚里" },
      { value: "Sassari", label: "萨萨里" },
      { value: "Olbia", label: "奥尔比亚" },
    ] },
    { value: "Liguria", label: "利古里亚大区", cities: [
      { value: "Genoa", label: "热那亚" },
      { value: "La Spezia", label: "拉斯佩齐亚" },
      { value: "Savona", label: "萨沃纳" },
      { value: "Imperia", label: "因佩里亚" },
    ] },
    { value: "Marche", label: "马尔凯大区", cities: [
      { value: "Ancona", label: "安科纳" },
      { value: "Pesaro", label: "佩萨罗" },
      { value: "Macerata", label: "马切拉塔" },
    ] },
    { value: "Abruzzo", label: "阿布鲁佐大区", cities: [
      { value: "L'Aquila", label: "拉奎拉" },
      { value: "Pescara", label: "佩斯卡拉" },
      { value: "Teramo", label: "泰拉莫" },
      { value: "Chieti", label: "基耶蒂" },
    ] },
    { value: "Friuli-Venezia Giulia", label: "弗留利-威尼斯朱利亚大区", cities: [
      { value: "Trieste", label: "的里雅斯特" },
      { value: "Udine", label: "乌迪内" },
      { value: "Pordenone", label: "波代诺内" },
    ] },
    { value: "Trentino-South Tyrol", label: "特伦蒂诺-上阿迪杰大区", cities: [
      { value: "Trento", label: "特伦托" },
      { value: "Bolzano", label: "博尔扎诺" },
      { value: "Rovereto", label: "罗韦雷托" },
    ] },
    { value: "Umbria", label: "翁布里亚大区", cities: [
      { value: "Perugia", label: "佩鲁贾" },
      { value: "Terni", label: "特尔尼" },
      { value: "Foligno", label: "福利尼奥" },
    ] },
    { value: "Basilicata", label: "巴西利卡塔大区", cities: [
      { value: "Potenza", label: "波坦察" },
      { value: "Matera", label: "马泰拉" },
      { value: "Melfi", label: "梅尔菲" },
    ] },
    { value: "Molise", label: "莫利塞大区", cities: [
      { value: "Campobasso", label: "坎波巴索" },
      { value: "Termoli", label: "泰尔莫利" },
      { value: "Isernia", label: "伊塞尔尼亚" },
    ] },
    { value: "Aosta Valley", label: "瓦莱达奥斯塔大区", cities: [
      { value: "Aosta", label: "奥斯塔" },
      { value: "Courmayeur", label: "库马约尔" },
      { value: "Chatillon", label: "沙蒂永" },
    ] },
  ],
  ES: [
    { value: "Andalusia", label: "安达卢西亚自治区", cities: [
      { value: "Seville", label: "塞维利亚" },
      { value: "Malaga", label: "马拉加" },
      { value: "Granada", label: "格拉纳达" },
      { value: "Cordoba", label: "科尔多瓦" },
      { value: "Almeria", label: "阿尔梅里亚" },
      { value: "Cadiz", label: "加的斯" },
      { value: "Jaen", label: "哈恩" },
    ] },
    { value: "Catalonia", label: "加泰罗尼亚自治区", cities: [
      { value: "Barcelona", label: "巴塞罗那" },
      { value: "Tarragona", label: "塔拉戈纳" },
      { value: "Lleida", label: "莱里达" },
      { value: "Girona", label: "赫罗纳" },
    ] },
    { value: "Community of Madrid", label: "马德里自治区", cities: [
      { value: "Madrid", label: "马德里" },
      { value: "Alcala de Henares", label: "阿尔卡拉-德埃纳雷斯" },
      { value: "Getafe", label: "赫塔费" },
    ] },
    { value: "Valencian Community", label: "瓦伦西亚自治区", cities: [
      { value: "Valencia", label: "瓦伦西亚" },
      { value: "Alicante", label: "阿利坎特" },
      { value: "Elche", label: "埃尔切" },
      { value: "Castellon de la Plana", label: "卡斯特利翁" },
    ] },
    { value: "Galicia", label: "加利西亚自治区", cities: [
      { value: "Santiago de Compostela", label: "圣地亚哥-德孔波斯特拉" },
      { value: "A Coruna", label: "拉科鲁尼亚" },
      { value: "Vigo", label: "维戈" },
      { value: "Ourense", label: "奥伦塞" },
    ] },
    { value: "Castile and Leon", label: "卡斯蒂利亚-莱昂自治区", cities: [
      { value: "Valladolid", label: "巴利亚多利德" },
      { value: "Burgos", label: "布尔戈斯" },
      { value: "Salamanca", label: "萨拉曼卡" },
      { value: "Leon", label: "莱昂" },
      { value: "Zamora", label: "萨莫拉" },
    ] },
    { value: "Basque Country", label: "巴斯克自治区", cities: [
      { value: "Bilbao", label: "毕尔巴鄂" },
      { value: "San Sebastian", label: "圣塞瓦斯蒂安" },
      { value: "Vitoria", label: "维多利亚" },
      { value: "Barakaldo", label: "巴拉卡尔多" },
    ] },
    { value: "Castile-La Mancha", label: "卡斯蒂利亚-拉曼查自治区", cities: [
      { value: "Toledo", label: "托莱多" },
      { value: "Ciudad Real", label: "雷阿尔城" },
      { value: "Albacete", label: "阿尔瓦塞特" },
      { value: "Guadalajara", label: "瓜达拉哈拉" },
    ] },
    { value: "Canary Islands", label: "加那利群岛自治区", cities: [
      { value: "Las Palmas", label: "拉斯帕尔马斯" },
      { value: "Santa Cruz de Tenerife", label: "圣克鲁斯-德特内里费" },
      { value: "La Laguna", label: "拉拉古纳" },
      { value: "Arona", label: "阿罗纳" },
    ] },
    { value: "Region of Murcia", label: "穆尔西亚自治区", cities: [
      { value: "Murcia", label: "穆尔西亚" },
      { value: "Cartagena", label: "卡塔赫纳" },
      { value: "Lorca", label: "洛尔卡" },
    ] },
    { value: "Aragon", label: "阿拉贡自治区", cities: [
      { value: "Zaragoza", label: "萨拉戈萨" },
      { value: "Huesca", label: "韦斯卡" },
      { value: "Teruel", label: "特鲁埃尔" },
    ] },
    { value: "Balearic Islands", label: "巴利阿里群岛自治区", cities: [
      { value: "Palma", label: "帕尔马" },
      { value: "Ibiza", label: "伊比沙" },
      { value: "Mahon", label: "马翁" },
    ] },
    { value: "Extremadura", label: "埃斯特雷马杜拉自治区", cities: [
      { value: "Badajoz", label: "巴达霍斯" },
      { value: "Merida", label: "梅里达" },
      { value: "Caceres", label: "卡塞雷斯" },
    ] },
    { value: "Asturias", label: "阿斯图里亚斯自治区", cities: [
      { value: "Oviedo", label: "奥维耶多" },
      { value: "Gijon", label: "希洪" },
      { value: "Aviles", label: "阿维莱斯" },
    ] },
    { value: "Navarre", label: "纳瓦拉自治区", cities: [
      { value: "Pamplona", label: "潘普洛纳" },
      { value: "Tudela", label: "图德拉" },
      { value: "Estella", label: "埃斯特利亚" },
    ] },
    { value: "Cantabria", label: "坎塔布里亚自治区", cities: [
      { value: "Santander", label: "桑坦德" },
      { value: "Torrelavega", label: "托雷拉韦加" },
      { value: "Castro Urdiales", label: "卡斯特罗-乌尔迪亚莱斯" },
    ] },
    { value: "La Rioja", label: "拉里奥哈自治区", cities: [
      { value: "Logrono", label: "洛格罗尼奥" },
      { value: "Calahorra", label: "卡拉奥拉" },
      { value: "Haro", label: "阿罗" },
    ] },
  ],
  NL: [
    { value: "South Holland", label: "南荷兰省", cities: [
      { value: "Rotterdam", label: "鹿特丹" },
      { value: "The Hague", label: "海牙" },
      { value: "Leiden", label: "莱顿" },
      { value: "Delft", label: "代尔夫特" },
      { value: "Gouda", label: "豪达" },
    ] },
    { value: "North Holland", label: "北荷兰省", cities: [
      { value: "Amsterdam", label: "阿姆斯特丹" },
      { value: "Haarlem", label: "哈勒姆" },
      { value: "Alkmaar", label: "阿尔克马尔" },
      { value: "Zaandam", label: "赞丹" },
    ] },
    { value: "North Brabant", label: "北布拉班特省", cities: [
      { value: "Eindhoven", label: "埃因霍温" },
      { value: "Tilburg", label: "蒂尔堡" },
      { value: "Breda", label: "布雷达" },
      { value: "'s-Hertogenbosch", label: "斯海尔托亨博斯" },
    ] },
    { value: "Gelderland", label: "海尔德兰省", cities: [
      { value: "Arnhem", label: "阿纳姆" },
      { value: "Nijmegen", label: "奈梅亨" },
      { value: "Apeldoorn", label: "阿珀尔多伦" },
    ] },
    { value: "Utrecht", label: "乌得勒支省", cities: [
      { value: "Utrecht", label: "乌得勒支" },
      { value: "Amersfoort", label: "阿默斯福特" },
      { value: "Veenendaal", label: "芬嫩达尔" },
    ] },
    { value: "Overijssel", label: "上艾瑟尔省", cities: [
      { value: "Zwolle", label: "兹沃勒" },
      { value: "Enschede", label: "恩斯赫德" },
      { value: "Deventer", label: "代芬特尔" },
    ] },
    { value: "Limburg", label: "林堡省", cities: [
      { value: "Maastricht", label: "马斯特里赫特" },
      { value: "Venlo", label: "芬洛" },
      { value: "Heerlen", label: "海尔伦" },
    ] },
    { value: "Friesland", label: "弗里斯兰省", cities: [
      { value: "Leeuwarden", label: "吕伐登" },
      { value: "Drachten", label: "德拉赫滕" },
      { value: "Sneek", label: "斯内克" },
    ] },
    { value: "Groningen", label: "格罗宁根省", cities: [
      { value: "Groningen", label: "格罗宁根" },
      { value: "Veendam", label: "芬丹" },
      { value: "Delfzijl", label: "代尔夫宰尔" },
    ] },
    { value: "Drenthe", label: "德伦特省", cities: [
      { value: "Assen", label: "阿森" },
      { value: "Emmen", label: "埃门" },
      { value: "Hoogeveen", label: "霍赫芬" },
    ] },
    { value: "Flevoland", label: "弗莱福兰省", cities: [
      { value: "Almere", label: "阿尔梅勒" },
      { value: "Lelystad", label: "莱利斯塔德" },
      { value: "Dronten", label: "德龙滕" },
    ] },
    { value: "Zeeland", label: "泽兰省", cities: [
      { value: "Middelburg", label: "米德尔堡" },
      { value: "Vlissingen", label: "弗利辛恩" },
      { value: "Goes", label: "胡斯" },
    ] },
  ],
  CH: [
    { value: "Zurich", label: "苏黎世州", cities: [
      { value: "Zurich", label: "苏黎世" },
      { value: "Winterthur", label: "温特图尔" },
      { value: "Uster", label: "乌斯特" },
    ] },
    { value: "Bern", label: "伯尔尼州", cities: [
      { value: "Bern", label: "伯尔尼" },
      { value: "Biel", label: "比尔" },
      { value: "Thun", label: "图恩" },
    ] },
    { value: "Geneva", label: "日内瓦州", cities: [
      { value: "Geneva", label: "日内瓦" },
      { value: "Vernier", label: "韦尼耶" },
      { value: "Meyrin", label: "梅兰" },
    ] },
    { value: "Vaud", label: "沃州", cities: [
      { value: "Lausanne", label: "洛桑" },
      { value: "Montreux", label: "蒙特勒" },
      { value: "Vevey", label: "沃韦" },
    ] },
    { value: "Basel-Stadt", label: "巴塞尔城市州", cities: [
      { value: "Basel", label: "巴塞尔" },
      { value: "Riehen", label: "里恩" },
      { value: "Bettingen", label: "Bettingen" },
    ] },
    { value: "Ticino", label: "提契诺州", cities: [
      { value: "Lugano", label: "卢加诺" },
      { value: "Bellinzona", label: "贝林佐纳" },
      { value: "Locarno", label: "洛迦诺" },
    ] },
    { value: "Lucerne", label: "卢塞恩州", cities: [
      { value: "Lucerne", label: "卢塞恩" },
      { value: "Emmen", label: "埃门" },
      { value: "Kriens", label: "克林斯" },
    ] },
    { value: "St. Gallen", label: "圣加仑州", cities: [
      { value: "St. Gallen", label: "圣加仑" },
      { value: "Rapperswil-Jona", label: "拉珀斯维尔-约纳" },
      { value: "Wil", label: "维尔" },
    ] },
    { value: "Aargau", label: "阿尔高州", cities: [
      { value: "Aarau", label: "阿劳" },
      { value: "Baden", label: "巴登" },
      { value: "Wettingen", label: "韦廷根" },
    ] },
    { value: "Valais", label: "瓦莱州", cities: [
      { value: "Sion", label: "锡永" },
      { value: "Martigny", label: "马蒂尼" },
      { value: "Visp", label: "菲斯普" },
    ] },
    { value: "Fribourg", label: "弗里堡州", cities: [
      { value: "Fribourg", label: "弗里堡" },
      { value: "Bulle", label: "比勒" },
      { value: "Murten", label: "穆尔滕" },
    ] },
    { value: "Neuchatel", label: "纳沙泰尔州", cities: [
      { value: "Neuchatel", label: "纳沙泰尔" },
      { value: "La Chaux-de-Fonds", label: "拉绍德封" },
      { value: "Le Locle", label: "勒洛克勒" },
    ] },
  ],
  SE: [
    { value: "Stockholm", label: "斯德哥尔摩省", cities: [
      { value: "Stockholm", label: "斯德哥尔摩" },
      { value: "Solna", label: "索尔纳" },
      { value: "Huddinge", label: "胡丁厄" },
    ] },
    { value: "Vastra Gotaland", label: "西约塔兰省", cities: [
      { value: "Gothenburg", label: "哥德堡" },
      { value: "Boras", label: "布罗斯" },
      { value: "Trollhattan", label: "特罗尔海坦" },
    ] },
    { value: "Skane", label: "斯科讷省", cities: [
      { value: "Malmo", label: "马尔默" },
      { value: "Lund", label: "隆德" },
      { value: "Helsingborg", label: "赫尔辛堡" },
      { value: "Landskrona", label: "兰斯克鲁纳" },
    ] },
    { value: "Uppsala", label: "乌普萨拉省", cities: [
      { value: "Uppsala", label: "乌普萨拉" },
      { value: "Enkoping", label: "恩雪平" },
      { value: "Osthammar", label: "奥斯特哈马尔" },
    ] },
    { value: "Ostergotland", label: "东约特兰省", cities: [
      { value: "Linkoping", label: "林雪平" },
      { value: "Norrkoping", label: "北雪平" },
      { value: "Motala", label: "穆塔拉" },
    ] },
    { value: "Jonkoping", label: "延雪平省", cities: [
      { value: "Jonkoping", label: "延雪平" },
      { value: "Nassjo", label: "奈舍" },
      { value: "Varnamo", label: "韦纳穆" },
    ] },
    { value: "Halland", label: "哈兰省", cities: [
      { value: "Halmstad", label: "哈姆斯塔德" },
      { value: "Varberg", label: "瓦尔贝里" },
      { value: "Falkenberg", label: "法尔肯贝里" },
    ] },
    { value: "Orebro", label: "厄勒布鲁省", cities: [
      { value: "Orebro", label: "厄勒布鲁" },
      { value: "Karlskoga", label: "卡尔斯库加" },
      { value: "Lindesberg", label: "林德斯贝里" },
    ] },
    { value: "Dalarna", label: "达拉纳省", cities: [
      { value: "Falun", label: "法伦" },
      { value: "Borlange", label: "博伦厄" },
      { value: "Mora", label: "莫拉" },
    ] },
    { value: "Norrbotten", label: "北博滕省", cities: [
      { value: "Lulea", label: "吕勒奥" },
      { value: "Kiruna", label: "基律纳" },
      { value: "Pitea", label: "皮特奥" },
    ] },
  ],
  IE: [
    { value: "Leinster", label: "伦斯特省", cities: [
      { value: "Dublin", label: "都柏林" },
      { value: "Kilkenny", label: "基尔肯尼" },
      { value: "Drogheda", label: "德罗赫达" },
      { value: "Wexford", label: "韦克斯福德" },
    ] },
    { value: "Munster", label: "芒斯特省", cities: [
      { value: "Cork", label: "科克" },
      { value: "Limerick", label: "利默里克" },
      { value: "Waterford", label: "沃特福德" },
      { value: "Killarney", label: "基拉尼" },
    ] },
    { value: "Connacht", label: "康诺特省", cities: [
      { value: "Galway", label: "戈尔韦" },
      { value: "Sligo", label: "斯莱戈" },
      { value: "Castlebar", label: "卡斯尔巴" },
    ] },
    { value: "Ulster", label: "阿尔斯特省", cities: [
      { value: "Donegal", label: "多尼戈尔" },
      { value: "Letterkenny", label: "莱特肯尼" },
      { value: "Cavan", label: "卡文" },
      { value: "Monaghan", label: "莫纳亨" },
    ] },
  ],
  BE: [
    { value: "Antwerp", label: "安特卫普省", cities: [
      { value: "Antwerp", label: "安特卫普" },
      { value: "Mechelen", label: "梅赫伦" },
      { value: "Turnhout", label: "蒂伦豪特" },
    ] },
    { value: "East Flanders", label: "东佛兰德省", cities: [
      { value: "Ghent", label: "根特" },
      { value: "Aalst", label: "阿尔斯特" },
      { value: "Sint-Niklaas", label: "圣尼克拉斯" },
    ] },
    { value: "West Flanders", label: "西佛兰德省", cities: [
      { value: "Bruges", label: "布鲁日" },
      { value: "Ostend", label: "奥斯坦德" },
      { value: "Kortrijk", label: "科特赖克" },
    ] },
    { value: "Limburg", label: "林堡省", cities: [
      { value: "Hasselt", label: "哈瑟尔特" },
      { value: "Genk", label: "亨克" },
      { value: "Sint-Truiden", label: "圣特雷登" },
    ] },
    { value: "Flemish Brabant", label: "弗拉芒布拉班特省", cities: [
      { value: "Leuven", label: "鲁汶" },
      { value: "Vilvoorde", label: "维尔福德" },
      { value: "Halle", label: "哈勒" },
    ] },
    { value: "Brussels-Capital Region", label: "布鲁塞尔首都大区", cities: [
      { value: "Brussels", label: "布鲁塞尔" },
      { value: "Anderlecht", label: "安德莱赫特" },
      { value: "Schaerbeek", label: "斯哈尔贝克" },
    ] },
    { value: "Walloon Brabant", label: "瓦隆布拉班特省", cities: [
      { value: "Wavre", label: "瓦夫尔" },
      { value: "Waterloo", label: "滑铁卢" },
      { value: "Nivelles", label: "尼韦勒" },
    ] },
    { value: "Hainaut", label: "埃诺省", cities: [
      { value: "Charleroi", label: "沙勒罗瓦" },
      { value: "Mons", label: "蒙斯" },
      { value: "Tournai", label: "图尔奈" },
    ] },
    { value: "Liege", label: "列日省", cities: [
      { value: "Liege", label: "列日" },
      { value: "Verviers", label: "韦尔维耶" },
      { value: "Seraing", label: "瑟兰" },
    ] },
    { value: "Namur", label: "那慕尔省", cities: [
      { value: "Namur", label: "那慕尔" },
      { value: "Dinant", label: "迪南" },
      { value: "Andenne", label: "昂代讷" },
    ] },
    { value: "Luxembourg", label: "卢森堡省", cities: [
      { value: "Arlon", label: "阿尔隆" },
      { value: "Bastogne", label: "巴斯托涅" },
      { value: "Marche-en-Famenne", label: "马尔什昂法梅讷" },
    ] },
  ],
  AT: [
    { value: "Vienna", label: "维也纳州", cities: [
      { value: "Vienna", label: "维也纳" },
    ] },
    { value: "Lower Austria", label: "下奥地利州", cities: [
      { value: "St. Polten", label: "圣珀尔滕" },
      { value: "Wiener Neustadt", label: "维也纳新城" },
      { value: "Krems", label: "克雷姆斯" },
    ] },
    { value: "Upper Austria", label: "上奥地利州", cities: [
      { value: "Linz", label: "林茨" },
      { value: "Wels", label: "韦尔斯" },
      { value: "Steyr", label: "施泰尔" },
    ] },
    { value: "Styria", label: "施蒂利亚州", cities: [
      { value: "Graz", label: "格拉茨" },
      { value: "Leoben", label: "莱奥本" },
      { value: "Kapfenberg", label: "卡普芬贝格" },
    ] },
    { value: "Tyrol", label: "蒂罗尔州", cities: [
      { value: "Innsbruck", label: "因斯布鲁克" },
      { value: "Kufstein", label: "库夫施泰因" },
      { value: "Lienz", label: "利恩茨" },
    ] },
    { value: "Salzburg", label: "萨尔茨堡州", cities: [
      { value: "Salzburg", label: "萨尔茨堡" },
      { value: "Hallein", label: "哈莱因" },
      { value: "Zell am See", label: "滨湖采尔" },
    ] },
    { value: "Carinthia", label: "克恩顿州", cities: [
      { value: "Klagenfurt", label: "克拉根福" },
      { value: "Villach", label: "菲拉赫" },
      { value: "Wolfsberg", label: "沃尔夫斯贝格" },
    ] },
    { value: "Vorarlberg", label: "福拉尔贝格州", cities: [
      { value: "Bregenz", label: "布雷根茨" },
      { value: "Dornbirn", label: "多恩比恩" },
      { value: "Feldkirch", label: "费尔德基希" },
    ] },
    { value: "Burgenland", label: "布尔根兰州", cities: [
      { value: "Eisenstadt", label: "艾森施塔特" },
      { value: "Neusiedl am See", label: "滨湖新锡德尔" },
      { value: "Oberwart", label: "上瓦特" },
    ] },
  ],
  PL: [
    { value: "Masovian", label: "马佐夫舍省", cities: [
      { value: "Warsaw", label: "华沙" },
      { value: "Radom", label: "拉多姆" },
      { value: "Plock", label: "普沃茨克" },
    ] },
    { value: "Lesser Poland", label: "小波兰省", cities: [
      { value: "Krakow", label: "克拉科夫" },
      { value: "Tarnow", label: "塔尔努夫" },
      { value: "Nowy Sacz", label: "新松奇" },
    ] },
    { value: "Silesian", label: "西里西亚省", cities: [
      { value: "Katowice", label: "卡托维兹" },
      { value: "Czestochowa", label: "琴斯托霍瓦" },
      { value: "Gliwice", label: "格利维采" },
    ] },
    { value: "Greater Poland", label: "大波兰省", cities: [
      { value: "Poznan", label: "波兹南" },
      { value: "Kalisz", label: "卡利什" },
      { value: "Konin", label: "科宁" },
    ] },
    { value: "Lower Silesian", label: "下西里西亚省", cities: [
      { value: "Wroclaw", label: "弗罗茨瓦夫" },
      { value: "Legnica", label: "莱格尼察" },
      { value: "Walbrzych", label: "瓦乌布日赫" },
    ] },
    { value: "Pomeranian", label: "滨海省", cities: [
      { value: "Gdansk", label: "格但斯克" },
      { value: "Gdynia", label: "格丁尼亚" },
      { value: "Sopot", label: "索波特" },
    ] },
    { value: "Lodz", label: "罗兹省", cities: [
      { value: "Lodz", label: "罗兹" },
      { value: "Pabianice", label: "帕比阿尼采" },
      { value: "Piotrkow Trybunalski", label: "彼得库夫-特雷布纳尔斯基" },
    ] },
    { value: "Kuyavian-Pomeranian", label: "库亚维-滨海省", cities: [
      { value: "Bydgoszcz", label: "比得哥什" },
      { value: "Torun", label: "托伦" },
      { value: "Wloclawek", label: "弗沃茨瓦韦克" },
    ] },
    { value: "Lublin", label: "卢布林省", cities: [
      { value: "Lublin", label: "卢布林" },
      { value: "Zamosc", label: "扎莫希奇" },
      { value: "Chelm", label: "海乌姆" },
    ] },
    { value: "West Pomeranian", label: "西滨海省", cities: [
      { value: "Szczecin", label: "什切青" },
      { value: "Koszalin", label: "科沙林" },
      { value: "Swinoujscie", label: "希维诺乌伊希切" },
    ] },
  ],
  PT: [
    { value: "Lisbon", label: "里斯本区", cities: [
      { value: "Lisbon", label: "里斯本" },
      { value: "Sintra", label: "辛特拉" },
      { value: "Cascais", label: "卡斯凯什" },
    ] },
    { value: "Porto", label: "波尔图区", cities: [
      { value: "Porto", label: "波尔图" },
      { value: "Vila Nova de Gaia", label: "新盖亚" },
      { value: "Matosinhos", label: "马托西纽斯" },
    ] },
    { value: "Braga", label: "布拉加区", cities: [
      { value: "Braga", label: "布拉加" },
      { value: "Guimaraes", label: "吉马良斯" },
      { value: "Barcelos", label: "巴塞卢什" },
    ] },
    { value: "Aveiro", label: "阿威罗区", cities: [
      { value: "Aveiro", label: "阿威罗" },
      { value: "Santa Maria da Feira", label: "圣玛丽亚-达费拉" },
      { value: "Oliveira de Azemeis", label: "奥利韦拉-迪阿泽梅什" },
    ] },
    { value: "Coimbra", label: "科英布拉区", cities: [
      { value: "Coimbra", label: "科英布拉" },
      { value: "Figueira da Foz", label: "菲盖拉达福什" },
      { value: "Cantanhede", label: "坎塔涅迪" },
    ] },
    { value: "Faro", label: "法鲁区", cities: [
      { value: "Faro", label: "法鲁" },
      { value: "Lagos", label: "拉各斯" },
      { value: "Portimao", label: "波尔蒂芒" },
    ] },
    { value: "Setubal", label: "塞图巴尔区", cities: [
      { value: "Setubal", label: "塞图巴尔" },
      { value: "Almada", label: "阿尔马达" },
      { value: "Barreiro", label: "巴雷鲁" },
    ] },
    { value: "Madeira", label: "马德拉自治区", cities: [
      { value: "Funchal", label: "丰沙尔" },
      { value: "Machico", label: "马希库" },
      { value: "Santa Cruz", label: "圣克鲁什" },
    ] },
    { value: "Azores", label: "亚速尔自治区", cities: [
      { value: "Ponta Delgada", label: "蓬塔德尔加达" },
      { value: "Angra do Heroismo", label: "英雄港" },
      { value: "Horta", label: "奥尔塔" },
    ] },
  ],
  DK: [
    { value: "Capital Region", label: "首都大区", cities: [
      { value: "Copenhagen", label: "哥本哈根" },
      { value: "Helsingor", label: "赫尔辛格" },
      { value: "Hillerod", label: "希勒勒" },
    ] },
    { value: "Central Denmark", label: "中日德兰大区", cities: [
      { value: "Aarhus", label: "奥胡斯" },
      { value: "Randers", label: "兰讷斯" },
      { value: "Viborg", label: "维堡" },
    ] },
    { value: "North Denmark", label: "北日德兰大区", cities: [
      { value: "Aalborg", label: "奥尔堡" },
      { value: "Frederikshavn", label: "腓特烈港" },
      { value: "Hjorring", label: "约灵" },
    ] },
    { value: "Region Zealand", label: "西兰大区", cities: [
      { value: "Roskilde", label: "罗斯基勒" },
      { value: "Slagelse", label: "斯劳厄尔瑟" },
      { value: "Naestved", label: "奈斯特韦兹" },
    ] },
    { value: "Southern Denmark", label: "南丹麦大区", cities: [
      { value: "Odense", label: "欧登塞" },
      { value: "Esbjerg", label: "埃斯比约" },
      { value: "Kolding", label: "科灵" },
    ] },
  ],
  NO: [
    { value: "Oslo", label: "奥斯陆", cities: [
      { value: "Oslo", label: "奥斯陆" },
    ] },
    { value: "Rogaland", label: "罗加兰郡", cities: [
      { value: "Stavanger", label: "斯塔万格" },
      { value: "Sandnes", label: "桑内斯" },
      { value: "Haugesund", label: "海于格松" },
    ] },
    { value: "Vestland", label: "韦斯特兰郡", cities: [
      { value: "Bergen", label: "卑尔根" },
      { value: "Leirvik", label: "莱尔维克" },
      { value: "Floro", label: "弗勒" },
    ] },
    { value: "Trondelag", label: "特伦德拉格郡", cities: [
      { value: "Trondheim", label: "特隆赫姆" },
      { value: "Levanger", label: "莱旺厄尔" },
      { value: "Steinkjer", label: "斯泰因谢尔" },
    ] },
    { value: "Troms", label: "特罗姆斯郡", cities: [
      { value: "Tromso", label: "特罗姆瑟" },
      { value: "Harstad", label: "哈尔斯塔" },
      { value: "Finnsnes", label: "芬斯内斯" },
    ] },
    { value: "Finnmark", label: "芬马克郡", cities: [
      { value: "Alta", label: "阿尔塔" },
      { value: "Hammerfest", label: "哈默费斯特" },
      { value: "Kirkenes", label: "希尔克内斯" },
    ] },
    { value: "Nordland", label: "诺尔兰郡", cities: [
      { value: "Bodo", label: "博德" },
      { value: "Narvik", label: "纳尔维克" },
      { value: "Mo i Rana", label: "拉纳穆" },
    ] },
    { value: "More og Romsdal", label: "默勒-鲁姆斯达尔郡", cities: [
      { value: "Alesund", label: "奥勒松" },
      { value: "Molde", label: "莫尔德" },
      { value: "Kristiansund", label: "克里斯蒂安松" },
    ] },
    { value: "Innlandet", label: "内陆郡", cities: [
      { value: "Hamar", label: "哈马尔" },
      { value: "Lillehammer", label: "利勒哈默尔" },
      { value: "Gjovik", label: "约维克" },
    ] },
    { value: "Agder", label: "阿格德尔郡", cities: [
      { value: "Kristiansand", label: "克里斯蒂安桑" },
      { value: "Arendal", label: "阿伦达尔" },
      { value: "Grimstad", label: "格里姆斯塔" },
    ] },
    { value: "Vestfold og Telemark", label: "西福尔-泰勒马克郡", cities: [
      { value: "Tonsberg", label: "滕斯贝格" },
      { value: "Skien", label: "希恩" },
      { value: "Larvik", label: "拉尔维克" },
    ] },
  ],
  FI: [
    { value: "Uusimaa", label: "新地区", cities: [
      { value: "Helsinki", label: "赫尔辛基" },
      { value: "Espoo", label: "埃斯波" },
      { value: "Vantaa", label: "万塔" },
      { value: "Porvoo", label: "波尔沃" },
    ] },
    { value: "Pirkanmaa", label: "皮尔卡区", cities: [
      { value: "Tampere", label: "坦佩雷" },
      { value: "Nokia", label: "诺基亚" },
      { value: "Ylojarvi", label: "于勒耶尔维" },
    ] },
    { value: "Southwest Finland", label: "西南芬兰区", cities: [
      { value: "Turku", label: "图尔库" },
      { value: "Salo", label: "萨洛" },
      { value: "Raisio", label: "赖西奥" },
    ] },
    { value: "North Ostrobothnia", label: "北博滕区", cities: [
      { value: "Oulu", label: "奥卢" },
      { value: "Kuusamo", label: "库萨莫" },
      { value: "Raahe", label: "拉赫" },
    ] },
    { value: "Central Finland", label: "中芬兰区", cities: [
      { value: "Jyvaskyla", label: "于韦斯屈莱" },
      { value: "Aanekoski", label: "阿内科斯基" },
      { value: "Saarijarvi", label: "萨里耶尔维" },
    ] },
    { value: "Lapland", label: "拉普兰区", cities: [
      { value: "Rovaniemi", label: "罗瓦涅米" },
      { value: "Kemi", label: "凯米" },
      { value: "Tornio", label: "托尔尼奥" },
    ] },
    { value: "North Savo", label: "北萨沃区", cities: [
      { value: "Kuopio", label: "库奥皮奥" },
      { value: "Varkaus", label: "瓦尔考斯" },
      { value: "Iisalmi", label: "伊萨尔米" },
    ] },
    { value: "Ostrobothnia", label: "博滕区", cities: [
      { value: "Vaasa", label: "瓦萨" },
      { value: "Jakobstad", label: "雅各布斯塔德" },
      { value: "Narpes", label: "纳尔珀斯" },
    ] },
  ],
  SG: [
    { value: "Central Region", label: "中部区", cities: [
      { value: "Orchard", label: "乌节路" },
      { value: "Raffles Place", label: "莱佛士坊" },
      { value: "Bugis", label: "武吉士" },
      { value: "Chinatown", label: "牛车水" },
      { value: "Marina Bay", label: "滨海湾" },
    ] },
    { value: "East Region", label: "东部区", cities: [
      { value: "Bedok", label: "勿洛" },
      { value: "Tampines", label: "淡滨尼" },
      { value: "Changi", label: "樟宜" },
      { value: "Pasir Ris", label: "巴西立" },
    ] },
    { value: "North Region", label: "北部区", cities: [
      { value: "Woodlands", label: "兀兰" },
      { value: "Yishun", label: "义顺" },
      { value: "Sembawang", label: "三巴旺" },
    ] },
    { value: "North-East Region", label: "东北区", cities: [
      { value: "Sengkang", label: "盛港" },
      { value: "Punggol", label: "榜鹅" },
      { value: "Serangoon", label: "实龙岗" },
    ] },
    { value: "West Region", label: "西部区", cities: [
      { value: "Jurong East", label: "裕廊东" },
      { value: "Jurong West", label: "裕廊西" },
      { value: "Tuas", label: "大士" },
      { value: "Bukit Batok", label: "武吉巴督" },
    ] },
  ],
  MY: [
    { value: "Selangor", label: "雪兰莪州", cities: [
      { value: "Shah Alam", label: "莎阿南" },
      { value: "Petaling Jaya", label: "八打灵再也" },
      { value: "Klang", label: "巴生" },
      { value: "Subang Jaya", label: "梳邦再也" },
    ] },
    { value: "Johor", label: "柔佛州", cities: [
      { value: "Johor Bahru", label: "新山" },
      { value: "Iskandar Puteri", label: "依斯干达公主城" },
      { value: "Batu Pahat", label: "峇株巴辖" },
    ] },
    { value: "Penang", label: "槟城州", cities: [
      { value: "George Town", label: "乔治市" },
      { value: "Butterworth", label: "北海" },
      { value: "Bukit Mertajam", label: "大山脚" },
    ] },
    { value: "Perak", label: "霹雳州", cities: [
      { value: "Ipoh", label: "怡保" },
      { value: "Taiping", label: "太平" },
    ] },
    { value: "Kuala Lumpur", label: "吉隆坡联邦直辖区", cities: [
      { value: "Kuala Lumpur", label: "吉隆坡" },
      { value: "Bukit Bintang", label: "武吉免登" },
    ] },
    { value: "Sabah", label: "沙巴州", cities: [
      { value: "Kota Kinabalu", label: "亚庇" },
      { value: "Sandakan", label: "山打根" },
      { value: "Tawau", label: "斗湖" },
    ] },
    { value: "Sarawak", label: "砂拉越州", cities: [
      { value: "Kuching", label: "古晋" },
      { value: "Miri", label: "美里" },
      { value: "Sibu", label: "诗巫" },
    ] },
    { value: "Negeri Sembilan", label: "森美兰州", cities: [
      { value: "Seremban", label: "芙蓉" },
      { value: "Port Dickson", label: "波德申" },
    ] },
    { value: "Pahang", label: "彭亨州", cities: [
      { value: "Kuantan", label: "关丹" },
      { value: "Temerloh", label: "淡马鲁" },
    ] },
    { value: "Kedah", label: "吉打州", cities: [
      { value: "Alor Setar", label: "亚罗士打" },
      { value: "Sungai Petani", label: "双溪大年" },
      { value: "Langkawi", label: "兰卡威" },
    ] },
    { value: "Kelantan", label: "吉兰丹州", cities: [
      { value: "Kota Bharu", label: "哥打巴鲁" },
    ] },
    { value: "Terengganu", label: "登嘉楼州", cities: [
      { value: "Kuala Terengganu", label: "瓜拉登嘉楼" },
      { value: "Kemaman", label: "甘马挽" },
    ] },
    { value: "Melaka", label: "马六甲州", cities: [
      { value: "Melaka", label: "马六甲市" },
      { value: "Alor Gajah", label: "亚罗牙也" },
    ] },
    { value: "Perlis", label: "玻璃市州", cities: [
      { value: "Kangar", label: "加央" },
      { value: "Arau", label: "亚娄" },
    ] },
    { value: "Putrajaya", label: "布城联邦直辖区", cities: [
      { value: "Putrajaya", label: "布城" },
    ] },
    { value: "Labuan", label: "纳闽联邦直辖区", cities: [
      { value: "Labuan", label: "纳闽" },
    ] },
  ],
  TH: [
    { value: "Bangkok", label: "曼谷", cities: [
      { value: "Bangkok", label: "曼谷" },
      { value: "Sukhumvit", label: "素坤逸" },
      { value: "Silom", label: "是隆" },
    ] },
    { value: "Chiang Mai", label: "清迈府", cities: [
      { value: "Chiang Mai", label: "清迈" },
      { value: "Nimman", label: "宁曼路" },
    ] },
    { value: "Phuket", label: "普吉府", cities: [
      { value: "Phuket", label: "普吉" },
      { value: "Patong", label: "芭东" },
      { value: "Kata", label: "卡塔海滩" },
    ] },
    { value: "Chonburi", label: "春武里府", cities: [
      { value: "Pattaya", label: "芭堤雅" },
      { value: "Si Racha", label: "是拉差" },
      { value: "Chonburi", label: "春武里" },
    ] },
    { value: "Khon Kaen", label: "孔敬府", cities: [
      { value: "Khon Kaen", label: "孔敬" },
    ] },
    { value: "Nakhon Ratchasima", label: "呵叻府", cities: [
      { value: "Nakhon Ratchasima", label: "呵叻" },
      { value: "Pak Chong", label: "巴冲" },
    ] },
    { value: "Ubon Ratchathani", label: "乌汶府", cities: [
      { value: "Ubon Ratchathani", label: "乌汶" },
      { value: "Warin Chamrap", label: "瓦林昌拉" },
    ] },
    { value: "Songkhla", label: "宋卡府", cities: [
      { value: "Hat Yai", label: "合艾" },
      { value: "Songkhla", label: "宋卡" },
    ] },
    { value: "Surat Thani", label: "素叻他尼府", cities: [
      { value: "Ko Samui", label: "苏梅岛" },
      { value: "Surat Thani", label: "素叻他尼" },
      { value: "Ko Pha Ngan", label: "帕岸岛" },
    ] },
    { value: "Krabi", label: "甲米府", cities: [
      { value: "Krabi", label: "甲米" },
      { value: "Ao Nang", label: "奥南海滩" },
    ] },
    { value: "Ayutthaya", label: "大城府", cities: [
      { value: "Ayutthaya", label: "大城" },
      { value: "Bang Pa-in", label: "邦巴茵" },
    ] },
    { value: "Chiang Rai", label: "清莱府", cities: [
      { value: "Chiang Rai", label: "清莱" },
      { value: "Mae Sai", label: "湄赛" },
    ] },
    { value: "Rayong", label: "罗勇府", cities: [
      { value: "Rayong", label: "罗勇" },
      { value: "Map Ta Phut", label: "玛塔普" },
    ] },
    { value: "Samut Prakan", label: "北榄府", cities: [
      { value: "Samut Prakan", label: "北榄" },
      { value: "Bang Sao Thong", label: "Bang Sao Thong" },
    ] },
    { value: "Nakhon Si Thammarat", label: "洛坤府", cities: [
      { value: "Nakhon Si Thammarat", label: "洛坤" },
    ] },
  ],
  VN: [
    { value: "Ho Chi Minh City", label: "胡志明市", cities: [
      { value: "Ho Chi Minh City", label: "胡志明市" },
      { value: "District 1", label: "第一郡" },
      { value: "Thu Duc", label: "守德市" },
    ] },
    { value: "Hanoi", label: "河内市", cities: [
      { value: "Hanoi", label: "河内" },
      { value: "Hoan Kiem", label: "还剑郡" },
    ] },
    { value: "Da Nang", label: "岘港市", cities: [
      { value: "Da Nang", label: "岘港" },
      { value: "Hai Chau", label: "海洲" },
    ] },
    { value: "Hai Phong", label: "海防市", cities: [
      { value: "Hai Phong", label: "海防" },
      { value: "Do Son", label: "涂山" },
    ] },
    { value: "Can Tho", label: "芹苴市", cities: [
      { value: "Can Tho", label: "芹苴" },
      { value: "Ninh Kieu", label: "宁桥" },
    ] },
    { value: "Quang Ninh", label: "广宁省", cities: [
      { value: "Ha Long", label: "下龙" },
      { value: "Cam Pha", label: "锦普" },
    ] },
    { value: "Khanh Hoa", label: "庆和省", cities: [
      { value: "Nha Trang", label: "芽庄" },
      { value: "Cam Ranh", label: "金兰" },
    ] },
    { value: "Thua Thien-Hue", label: "承天顺化省", cities: [
      { value: "Hue", label: "顺化" },
    ] },
    { value: "Nghe An", label: "义安省", cities: [
      { value: "Vinh", label: "荣市" },
      { value: "Cua Lo", label: "炉门" },
    ] },
    { value: "Dong Nai", label: "同奈省", cities: [
      { value: "Bien Hoa", label: "边和" },
      { value: "Long Khanh", label: "隆庆" },
    ] },
    { value: "Binh Duong", label: "平阳省", cities: [
      { value: "Thu Dau Mot", label: "土龙木" },
      { value: "Di An", label: "以安" },
    ] },
    { value: "Ba Ria-Vung Tau", label: "巴地头顿省", cities: [
      { value: "Vung Tau", label: "头顿" },
      { value: "Ba Ria", label: "巴地" },
    ] },
    { value: "Lam Dong", label: "林同省", cities: [
      { value: "Da Lat", label: "大叻" },
      { value: "Bao Loc", label: "保禄" },
    ] },
    { value: "Kien Giang", label: "坚江省", cities: [
      { value: "Phu Quoc", label: "富国岛" },
      { value: "Rach Gia", label: "迪石" },
    ] },
    { value: "An Giang", label: "安江省", cities: [
      { value: "Long Xuyen", label: "隆川" },
      { value: "Chau Doc", label: "朱笃" },
    ] },
  ],
  ID: [
    { value: "Jakarta", label: "雅加达首都特区", cities: [
      { value: "Jakarta", label: "雅加达" },
      { value: "South Jakarta", label: "南雅加达" },
    ] },
    { value: "West Java", label: "西爪哇省", cities: [
      { value: "Bandung", label: "万隆" },
      { value: "Bogor", label: "茂物" },
      { value: "Bekasi", label: "勿加泗" },
      { value: "Depok", label: "德波" },
    ] },
    { value: "Central Java", label: "中爪哇省", cities: [
      { value: "Semarang", label: "三宝垄" },
      { value: "Solo", label: "梭罗" },
    ] },
    { value: "East Java", label: "东爪哇省", cities: [
      { value: "Surabaya", label: "泗水" },
      { value: "Malang", label: "玛琅" },
    ] },
    { value: "Banten", label: "万丹省", cities: [
      { value: "Tangerang", label: "坦格朗" },
      { value: "Serang", label: "西朗" },
      { value: "Cilegon", label: "芝勒贡" },
    ] },
    { value: "Yogyakarta", label: "日惹特区", cities: [
      { value: "Yogyakarta", label: "日惹" },
      { value: "Sleman", label: "斯莱曼" },
    ] },
    { value: "Bali", label: "巴厘省", cities: [
      { value: "Denpasar", label: "登巴萨" },
      { value: "Kuta", label: "库塔" },
      { value: "Ubud", label: "乌布" },
    ] },
    { value: "North Sumatra", label: "北苏门答腊省", cities: [
      { value: "Medan", label: "棉兰" },
      { value: "Pematangsiantar", label: "先达" },
    ] },
    { value: "South Sumatra", label: "南苏门答腊省", cities: [
      { value: "Palembang", label: "巨港" },
      { value: "Prabumulih", label: "Prabumulih" },
    ] },
    { value: "West Sumatra", label: "西苏门答腊省", cities: [
      { value: "Padang", label: "巴东" },
      { value: "Bukittinggi", label: "武吉丁宜" },
    ] },
    { value: "Riau", label: "廖内省", cities: [
      { value: "Pekanbaru", label: "北干巴鲁" },
      { value: "Dumai", label: "杜迈" },
    ] },
    { value: "South Kalimantan", label: "南加里曼丹省", cities: [
      { value: "Banjarmasin", label: "马辰" },
      { value: "Banjarbaru", label: "班加尔巴鲁" },
    ] },
    { value: "East Kalimantan", label: "东加里曼丹省", cities: [
      { value: "Balikpapan", label: "巴厘巴板" },
      { value: "Samarinda", label: "三马林达" },
    ] },
    { value: "South Sulawesi", label: "南苏拉威西省", cities: [
      { value: "Makassar", label: "望加锡" },
      { value: "Parepare", label: "帕雷帕雷" },
    ] },
    { value: "West Nusa Tenggara", label: "西努沙登加拉省", cities: [
      { value: "Mataram", label: "马塔兰" },
      { value: "Lombok", label: "龙目岛" },
    ] },
  ],
  PH: [
    { value: "Metro Manila", label: "马尼拉大都会", cities: [
      { value: "Manila", label: "马尼拉" },
      { value: "Quezon City", label: "奎松市" },
      { value: "Makati", label: "马卡蒂" },
      { value: "Taguig", label: "塔吉格" },
      { value: "Pasig", label: "帕西格" },
    ] },
    { value: "Cebu", label: "宿务省", cities: [
      { value: "Cebu City", label: "宿务市" },
      { value: "Lapu-Lapu", label: "拉普拉普" },
      { value: "Mandaue", label: "曼达维" },
    ] },
    { value: "Davao del Sur", label: "南达沃省", cities: [
      { value: "Davao City", label: "达沃市" },
      { value: "Digos", label: "迪戈斯" },
    ] },
    { value: "Iloilo", label: "伊洛伊洛省", cities: [
      { value: "Iloilo City", label: "伊洛伊洛市" },
      { value: "Passi", label: "帕西" },
    ] },
    { value: "Batangas", label: "八打雁省", cities: [
      { value: "Batangas", label: "八打雁" },
      { value: "Lipa", label: "利帕" },
      { value: "Tanauan", label: "塔纳武安" },
    ] },
    { value: "Pampanga", label: "邦板牙省", cities: [
      { value: "Angeles", label: "安赫莱斯" },
      { value: "San Fernando", label: "圣费尔南多" },
      { value: "Clark", label: "克拉克" },
    ] },
    { value: "Cavite", label: "甲米地省", cities: [
      { value: "Dasmarinas", label: "达斯马里尼亚斯" },
      { value: "Bacoor", label: "巴科奥尔" },
      { value: "Imus", label: "伊穆斯" },
    ] },
    { value: "Laguna", label: "拉古纳省", cities: [
      { value: "Calamba", label: "卡兰巴" },
      { value: "Santa Rosa", label: "圣罗莎" },
      { value: "Binan", label: "比南" },
    ] },
    { value: "Bulacan", label: "布拉干省", cities: [
      { value: "Malolos", label: "马洛洛斯" },
      { value: "Meycauayan", label: "梅考阿延" },
      { value: "San Jose del Monte", label: "圣何塞德尔蒙特" },
    ] },
    { value: "Negros Occidental", label: "西内格罗斯省", cities: [
      { value: "Bacolod", label: "巴科洛德" },
      { value: "Silay", label: "锡莱" },
    ] },
    { value: "Bohol", label: "薄荷省", cities: [
      { value: "Tagbilaran", label: "塔比拉兰" },
      { value: "Panglao", label: "邦劳" },
    ] },
    { value: "Zamboanga del Sur", label: "南三宝颜省", cities: [
      { value: "Zamboanga City", label: "三宝颜市" },
      { value: "Pagadian", label: "帕加迪安" },
    ] },
  ],
  NZ: [
    { value: "Auckland", label: "奥克兰地区", cities: [
      { value: "Auckland", label: "奥克兰" },
      { value: "Manukau", label: "马努考" },
      { value: "North Shore", label: "北岸" },
    ] },
    { value: "Wellington", label: "惠灵顿地区", cities: [
      { value: "Wellington", label: "惠灵顿" },
      { value: "Lower Hutt", label: "Lower Hutt" },
      { value: "Porirua", label: "波里鲁阿" },
    ] },
    { value: "Canterbury", label: "坎特伯雷地区", cities: [
      { value: "Christchurch", label: "基督城" },
      { value: "Timaru", label: "蒂马鲁" },
      { value: "Ashburton", label: "阿什伯顿" },
    ] },
    { value: "Waikato", label: "怀卡托地区", cities: [
      { value: "Hamilton", label: "汉密尔顿" },
      { value: "Cambridge", label: "剑桥" },
      { value: "Taupo", label: "陶波" },
    ] },
    { value: "Bay of Plenty", label: "丰盛湾地区", cities: [
      { value: "Tauranga", label: "陶朗加" },
      { value: "Rotorua", label: "罗托鲁瓦" },
    ] },
    { value: "Otago", label: "奥塔哥地区", cities: [
      { value: "Dunedin", label: "达尼丁" },
      { value: "Queenstown", label: "皇后镇" },
    ] },
    { value: "Manawatu-Whanganui", label: "马纳瓦图-旺加努伊地区", cities: [
      { value: "Palmerston North", label: "北帕默斯顿" },
      { value: "Whanganui", label: "旺加努伊" },
    ] },
    { value: "Hawke's Bay", label: "霍克斯湾地区", cities: [
      { value: "Napier", label: "内皮尔" },
      { value: "Hastings", label: "黑斯廷斯" },
    ] },
    { value: "Taranaki", label: "塔拉纳基地区", cities: [
      { value: "New Plymouth", label: "新普利茅斯" },
    ] },
    { value: "Northland", label: "北地地区", cities: [
      { value: "Whangarei", label: "旺格雷" },
    ] },
    { value: "Gisborne", label: "吉斯伯恩地区", cities: [
      { value: "Gisborne", label: "吉斯伯恩" },
    ] },
    { value: "Marlborough", label: "马尔堡地区", cities: [
      { value: "Blenheim", label: "布伦海姆" },
    ] },
    { value: "Nelson", label: "尼尔森地区", cities: [
      { value: "Nelson", label: "尼尔森" },
    ] },
    { value: "Tasman", label: "塔斯曼地区", cities: [
      { value: "Richmond", label: "里士满" },
    ] },
    { value: "West Coast", label: "西海岸地区", cities: [
      { value: "Greymouth", label: "格雷茅斯" },
    ] },
    { value: "Southland", label: "南地地区", cities: [
      { value: "Invercargill", label: "因弗卡吉尔" },
    ] },
  ],
  RU: [
    { value: "Moscow", label: "莫斯科市", cities: [
      { value: "Moscow", label: "莫斯科" },
    ] },
    { value: "Saint Petersburg", label: "圣彼得堡市", cities: [
      { value: "Saint Petersburg", label: "圣彼得堡" },
    ] },
    { value: "Moscow Oblast", label: "莫斯科州", cities: [
      { value: "Khimki", label: "希姆基" },
      { value: "Podolsk", label: "波多利斯克" },
      { value: "Balashikha", label: "巴拉希哈" },
      { value: "Korolyov", label: "科罗廖夫" },
      { value: "Mytishchi", label: "梅季希" },
    ] },
    { value: "Krasnodar Krai", label: "克拉斯诺达尔边疆区", cities: [
      { value: "Krasnodar", label: "克拉斯诺达尔" },
      { value: "Sochi", label: "索契" },
      { value: "Novorossiysk", label: "新罗西斯克" },
      { value: "Armavir", label: "阿尔马维尔" },
    ] },
    { value: "Sverdlovsk Oblast", label: "斯维尔德洛夫斯克州", cities: [
      { value: "Yekaterinburg", label: "叶卡捷琳堡" },
      { value: "Nizhny Tagil", label: "下塔吉尔" },
      { value: "Kamensk-Uralsky", label: "卡缅斯克-乌拉尔斯基" },
    ] },
    { value: "Novosibirsk Oblast", label: "新西伯利亚州", cities: [
      { value: "Novosibirsk", label: "新西伯利亚" },
      { value: "Berdsk", label: "别尔茨克" },
    ] },
    { value: "Tatarstan", label: "鞑靼斯坦共和国", cities: [
      { value: "Kazan", label: "喀山" },
      { value: "Naberezhnye Chelny", label: "卡马河畔切尔尼" },
      { value: "Almetyevsk", label: "阿尔梅季耶夫斯克" },
    ] },
    { value: "Nizhny Novgorod Oblast", label: "下诺夫哥罗德州", cities: [
      { value: "Nizhny Novgorod", label: "下诺夫哥罗德" },
      { value: "Dzerzhinsk", label: "捷尔任斯克" },
      { value: "Arzamas", label: "阿尔扎马斯" },
    ] },
    { value: "Samara Oblast", label: "萨马拉州", cities: [
      { value: "Samara", label: "萨马拉" },
      { value: "Tolyatti", label: "陶里亚蒂" },
      { value: "Syzran", label: "塞兹兰" },
    ] },
    { value: "Rostov Oblast", label: "罗斯托夫州", cities: [
      { value: "Rostov-on-Don", label: "顿河畔罗斯托夫" },
      { value: "Taganrog", label: "塔甘罗格" },
      { value: "Shakhty", label: "沙赫特" },
    ] },
    { value: "Chelyabinsk Oblast", label: "车里雅宾斯克州", cities: [
      { value: "Chelyabinsk", label: "车里雅宾斯克" },
      { value: "Magnitogorsk", label: "马格尼托哥尔斯克" },
      { value: "Zlatoust", label: "兹拉托乌斯特" },
    ] },
    { value: "Krasnoyarsk Krai", label: "克拉斯诺亚尔斯克边疆区", cities: [
      { value: "Krasnoyarsk", label: "克拉斯诺亚尔斯克" },
      { value: "Norilsk", label: "诺里尔斯克" },
      { value: "Achinsk", label: "阿钦斯克" },
    ] },
    { value: "Primorsky Krai", label: "滨海边疆区", cities: [
      { value: "Vladivostok", label: "符拉迪沃斯托克" },
      { value: "Nakhodka", label: "纳霍德卡" },
      { value: "Ussuriysk", label: "乌苏里斯克" },
    ] },
    { value: "Leningrad Oblast", label: "列宁格勒州", cities: [
      { value: "Gatchina", label: "加特契纳" },
      { value: "Vyborg", label: "维堡" },
      { value: "Vsevolozhsk", label: "弗谢沃洛日斯克" },
    ] },
    { value: "Kaliningrad Oblast", label: "加里宁格勒州", cities: [
      { value: "Kaliningrad", label: "加里宁格勒" },
      { value: "Baltiysk", label: "巴尔季斯克" },
    ] },
  ],
  AE: [
    { value: "Dubai", label: "迪拜酋长国", cities: [
      { value: "Dubai", label: "迪拜" },
      { value: "Jebel Ali", label: "杰贝阿里" },
    ] },
    { value: "Abu Dhabi", label: "阿布扎比酋长国", cities: [
      { value: "Abu Dhabi", label: "阿布扎比" },
      { value: "Al Ain", label: "艾因" },
    ] },
    { value: "Sharjah", label: "沙迦酋长国", cities: [
      { value: "Sharjah", label: "沙迦" },
      { value: "Khor Fakkan", label: "豪尔法坎" },
    ] },
    { value: "Ajman", label: "阿治曼酋长国", cities: [
      { value: "Ajman", label: "阿治曼" },
      { value: "Masfout", label: "马斯富特" },
    ] },
    { value: "Ras Al Khaimah", label: "哈伊马角酋长国", cities: [
      { value: "Ras Al Khaimah", label: "哈伊马角" },
    ] },
    { value: "Fujairah", label: "富查伊拉酋长国", cities: [
      { value: "Fujairah", label: "富查伊拉" },
      { value: "Dibba Al-Fujairah", label: "迪巴富查伊拉" },
    ] },
    { value: "Umm Al Quwain", label: "乌姆盖万酋长国", cities: [
      { value: "Umm Al Quwain", label: "乌姆盖万" },
    ] },
  ],
  SA: [
    { value: "Riyadh", label: "利雅得省", cities: [
      { value: "Riyadh", label: "利雅得" },
      { value: "Al Kharj", label: "阿尔卡吉" },
      { value: "Diriyah", label: "德拉伊耶" },
    ] },
    { value: "Makkah", label: "麦加省", cities: [
      { value: "Jeddah", label: "吉达" },
      { value: "Mecca", label: "麦加" },
      { value: "Taif", label: "塔伊夫" },
    ] },
    { value: "Eastern Province", label: "东部省", cities: [
      { value: "Dammam", label: "达曼" },
      { value: "Al Khobar", label: "胡拜尔" },
      { value: "Dhahran", label: "宰赫兰" },
      { value: "Jubail", label: "朱拜勒" },
    ] },
    { value: "Madinah", label: "麦地那省", cities: [
      { value: "Medina", label: "麦地那" },
      { value: "Yanbu", label: "延布" },
    ] },
    { value: "Asir", label: "阿西尔省", cities: [
      { value: "Abha", label: "艾卜哈" },
      { value: "Khamis Mushait", label: "哈米斯穆谢特" },
    ] },
    { value: "Tabuk", label: "塔布克省", cities: [
      { value: "Tabuk", label: "塔布克" },
    ] },
    { value: "Qassim", label: "卡西姆省", cities: [
      { value: "Buraidah", label: "布赖代" },
      { value: "Unaizah", label: "乌奈扎" },
    ] },
    { value: "Hail", label: "哈伊勒省", cities: [
      { value: "Hail", label: "哈伊勒" },
    ] },
  ],
  IL: [
    { value: "Tel Aviv", label: "特拉维夫区", cities: [
      { value: "Tel Aviv-Yafo", label: "特拉维夫-雅法" },
      { value: "Herzliya", label: "赫兹利亚" },
      { value: "Ramat Gan", label: "拉马特甘" },
      { value: "Holon", label: "霍隆" },
    ] },
    { value: "Central", label: "中央区", cities: [
      { value: "Rishon LeZion", label: "里雄莱锡安" },
      { value: "Petah Tikva", label: "佩塔提克瓦" },
      { value: "Netanya", label: "内坦亚" },
      { value: "Rehovot", label: "雷霍沃特" },
    ] },
    { value: "Jerusalem", label: "耶路撒冷区", cities: [
      { value: "Jerusalem", label: "耶路撒冷" },
      { value: "Beit Shemesh", label: "贝特谢梅什" },
    ] },
    { value: "Haifa", label: "海法区", cities: [
      { value: "Haifa", label: "海法" },
      { value: "Hadera", label: "哈代拉" },
    ] },
    { value: "Southern", label: "南部区", cities: [
      { value: "Beersheba", label: "贝尔谢巴" },
      { value: "Ashdod", label: "阿什杜德" },
      { value: "Eilat", label: "埃拉特" },
      { value: "Ashkelon", label: "阿什凯隆" },
    ] },
    { value: "Northern", label: "北部区", cities: [
      { value: "Nazareth", label: "拿撒勒" },
      { value: "Tiberias", label: "太巴列" },
      { value: "Afula", label: "阿富拉" },
    ] },
  ],
  TR: [
    { value: "Istanbul", label: "伊斯坦布尔省", cities: [
      { value: "Istanbul", label: "伊斯坦布尔" },
    ] },
    { value: "Ankara", label: "安卡拉省", cities: [
      { value: "Ankara", label: "安卡拉" },
    ] },
    { value: "Izmir", label: "伊兹密尔省", cities: [
      { value: "Izmir", label: "伊兹密尔" },
    ] },
    { value: "Bursa", label: "布尔萨省", cities: [
      { value: "Bursa", label: "布尔萨" },
    ] },
    { value: "Antalya", label: "安塔利亚省", cities: [
      { value: "Antalya", label: "安塔利亚" },
      { value: "Alanya", label: "阿拉尼亚" },
      { value: "Kemer", label: "凯梅尔" },
    ] },
    { value: "Adana", label: "阿达纳省", cities: [
      { value: "Adana", label: "阿达纳" },
      { value: "Ceyhan", label: "杰伊汉" },
      { value: "Kozan", label: "科赞" },
    ] },
    { value: "Gaziantep", label: "加济安泰普省", cities: [
      { value: "Gaziantep", label: "加济安泰普" },
    ] },
    { value: "Konya", label: "科尼亚省", cities: [
      { value: "Konya", label: "科尼亚" },
    ] },
    { value: "Kayseri", label: "开塞利省", cities: [
      { value: "Kayseri", label: "开塞利" },
    ] },
    { value: "Mersin", label: "梅尔辛省", cities: [
      { value: "Mersin", label: "梅尔辛" },
      { value: "Tarsus", label: "塔尔苏斯" },
      { value: "Silifke", label: "锡利夫凯" },
    ] },
    { value: "Eskisehir", label: "埃斯基谢希尔省", cities: [
      { value: "Eskisehir", label: "埃斯基谢希尔" },
    ] },
    { value: "Trabzon", label: "特拉布宗省", cities: [
      { value: "Trabzon", label: "特拉布宗" },
    ] },
  ],
  ZA: [
    { value: "Gauteng", label: "豪登省", cities: [
      { value: "Johannesburg", label: "约翰内斯堡" },
      { value: "Pretoria", label: "比勒陀利亚" },
      { value: "Sandton", label: "桑顿" },
      { value: "Midrand", label: "米德兰" },
    ] },
    { value: "KwaZulu-Natal", label: "夸祖鲁-纳塔尔省", cities: [
      { value: "Durban", label: "德班" },
      { value: "Pietermaritzburg", label: "彼得马里茨堡" },
      { value: "Umhlanga", label: "乌姆兰加" },
      { value: "Richards Bay", label: "理查兹湾" },
    ] },
    { value: "Western Cape", label: "西开普省", cities: [
      { value: "Cape Town", label: "开普敦" },
      { value: "Stellenbosch", label: "斯泰伦博斯" },
      { value: "Paarl", label: "帕尔" },
    ] },
    { value: "Eastern Cape", label: "东开普省", cities: [
      { value: "Gqeberha", label: "格凯贝哈" },
      { value: "East London", label: "东伦敦" },
      { value: "Mthatha", label: "姆塔塔" },
    ] },
    { value: "Limpopo", label: "林波波省", cities: [
      { value: "Polokwane", label: "波罗克瓦尼" },
      { value: "Tzaneen", label: "扎宁" },
    ] },
    { value: "Mpumalanga", label: "姆普马兰加省", cities: [
      { value: "Nelspruit", label: "内尔斯普雷特" },
      { value: "Emalahleni", label: "埃马拉赫莱尼" },
    ] },
    { value: "North West", label: "西北省", cities: [
      { value: "Rustenburg", label: "勒斯滕堡" },
      { value: "Klerksdorp", label: "克莱克斯多普" },
    ] },
    { value: "Free State", label: "自由邦省", cities: [
      { value: "Bloemfontein", label: "布隆方丹" },
      { value: "Welkom", label: "威尔康" },
    ] },
    { value: "Northern Cape", label: "北开普省", cities: [
      { value: "Kimberley", label: "金伯利" },
      { value: "Upington", label: "阿平顿" },
    ] },
  ],
  EG: [
    { value: "Cairo", label: "开罗省", cities: [
      { value: "Cairo", label: "开罗" },
      { value: "New Cairo", label: "新开罗" },
      { value: "Heliopolis", label: "赫利奥波利斯" },
    ] },
    { value: "Giza", label: "吉萨省", cities: [
      { value: "Giza", label: "吉萨" },
      { value: "6th of October City", label: "十月六日城" },
      { value: "Sheikh Zayed City", label: "谢赫扎耶德城" },
    ] },
    { value: "Alexandria", label: "亚历山大省", cities: [
      { value: "Alexandria", label: "亚历山大" },
      { value: "Borg El Arab", label: "阿拉伯堡" },
    ] },
    { value: "Dakahlia", label: "达卡利亚省", cities: [
      { value: "Mansoura", label: "曼苏拉" },
    ] },
    { value: "Red Sea", label: "红海省", cities: [
      { value: "Hurghada", label: "赫尔格达" },
      { value: "Sharm El Sheikh", label: "沙姆沙伊赫" },
    ] },
    { value: "Sharqia", label: "东方省", cities: [
      { value: "Zagazig", label: "扎加济格" },
    ] },
    { value: "Gharbia", label: "西部省", cities: [
      { value: "Tanta", label: "坦塔" },
      { value: "El Mahalla El Kubra", label: "大迈哈莱" },
    ] },
    { value: "Aswan", label: "阿斯旺省", cities: [
      { value: "Aswan", label: "阿斯旺" },
    ] },
    { value: "Luxor", label: "卢克索省", cities: [
      { value: "Luxor", label: "卢克索" },
    ] },
    { value: "Port Said", label: "塞得港省", cities: [
      { value: "Port Said", label: "塞得港" },
    ] },
  ],
  NG: [
    { value: "Lagos", label: "拉各斯州", cities: [
      { value: "Lagos", label: "拉各斯" },
      { value: "Ikeja", label: "伊凯贾" },
    ] },
    { value: "Kano", label: "卡诺州", cities: [
      { value: "Kano", label: "卡诺" },
    ] },
    { value: "Rivers", label: "河流州", cities: [
      { value: "Port Harcourt", label: "哈科特港" },
    ] },
    { value: "Oyo", label: "奥约州", cities: [
      { value: "Ibadan", label: "伊巴丹" },
      { value: "Ogbomosho", label: "奥格博莫绍" },
    ] },
    { value: "Kaduna", label: "卡杜纳州", cities: [
      { value: "Kaduna", label: "卡杜纳" },
      { value: "Zaria", label: "扎里亚" },
    ] },
    { value: "Federal Capital Territory", label: "联邦首都区", cities: [
      { value: "Abuja", label: "阿布贾" },
    ] },
    { value: "Ogun", label: "奥贡州", cities: [
      { value: "Abeokuta", label: "阿贝奥库塔" },
      { value: "Sango Ota", label: "桑戈奥塔" },
    ] },
    { value: "Delta", label: "三角洲州", cities: [
      { value: "Warri", label: "瓦里" },
      { value: "Asaba", label: "阿萨巴" },
    ] },
    { value: "Enugu", label: "埃努古州", cities: [
      { value: "Enugu", label: "埃努古" },
      { value: "Nsukka", label: "恩苏卡" },
    ] },
    { value: "Anambra", label: "阿南布拉州", cities: [
      { value: "Onitsha", label: "奥尼查" },
      { value: "Awka", label: "奥卡" },
    ] },
    { value: "Borno", label: "博尔诺州", cities: [
      { value: "Maiduguri", label: "迈杜古里" },
    ] },
    { value: "Plateau", label: "高原州", cities: [
      { value: "Jos", label: "乔斯" },
    ] },
  ],
  KE: [
    { value: "Nairobi", label: "内罗毕郡", cities: [
      { value: "Nairobi", label: "内罗毕" },
    ] },
    { value: "Mombasa", label: "蒙巴萨郡", cities: [
      { value: "Mombasa", label: "蒙巴萨" },
    ] },
    { value: "Kisumu", label: "基苏木郡", cities: [
      { value: "Kisumu", label: "基苏木" },
    ] },
    { value: "Nakuru", label: "纳库鲁郡", cities: [
      { value: "Nakuru", label: "纳库鲁" },
      { value: "Naivasha", label: "奈瓦沙" },
    ] },
    { value: "Kiambu", label: "基安布郡", cities: [
      { value: "Thika", label: "锡卡" },
      { value: "Kiambu", label: "基安布" },
      { value: "Ruiru", label: "鲁伊鲁" },
    ] },
    { value: "Uasin Gishu", label: "瓦辛基舒郡", cities: [
      { value: "Eldoret", label: "埃尔多雷特" },
    ] },
    { value: "Machakos", label: "马查科斯郡", cities: [
      { value: "Machakos", label: "马查科斯" },
      { value: "Athi River", label: "阿西里弗" },
    ] },
    { value: "Kilifi", label: "基利菲郡", cities: [
      { value: "Kilifi", label: "基利菲" },
      { value: "Malindi", label: "马林迪" },
    ] },
  ],
  AR: [
    { value: "Buenos Aires Province", label: "布宜诺斯艾利斯省", cities: [
      { value: "La Plata", label: "拉普拉塔" },
      { value: "Mar del Plata", label: "马德普拉塔" },
      { value: "Bahia Blanca", label: "布兰卡港" },
    ] },
    { value: "Cordoba", label: "科尔多瓦省", cities: [
      { value: "Cordoba", label: "科尔多瓦" },
      { value: "Rio Cuarto", label: "里奥夸尔托" },
      { value: "Villa Maria", label: "比利亚玛丽亚" },
    ] },
    { value: "Santa Fe", label: "圣菲省", cities: [
      { value: "Rosario", label: "罗萨里奥" },
      { value: "Santa Fe", label: "圣菲" },
      { value: "Rafaela", label: "拉斐拉" },
    ] },
    { value: "Mendoza", label: "门多萨省", cities: [
      { value: "Mendoza", label: "门多萨" },
      { value: "San Rafael", label: "圣拉斐尔" },
      { value: "Godoy Cruz", label: "戈多伊克鲁斯" },
    ] },
    { value: "Tucuman", label: "图库曼省", cities: [
      { value: "San Miguel de Tucuman", label: "圣米格尔-德图库曼" },
      { value: "Yerba Buena", label: "耶尔瓦布埃纳" },
      { value: "Tafi Viejo", label: "Tafi Viejo" },
    ] },
    { value: "Entre Rios", label: "恩特雷里奥斯省", cities: [
      { value: "Parana", label: "巴拉那" },
      { value: "Concordia", label: "康科迪亚" },
      { value: "Gualeguaychu", label: "瓜莱瓜伊丘" },
    ] },
    { value: "Salta", label: "萨尔塔省", cities: [
      { value: "Salta", label: "萨尔塔" },
      { value: "Oran", label: "奥兰" },
      { value: "Tartagal", label: "Tartagal" },
    ] },
    { value: "Chaco", label: "查科省", cities: [
      { value: "Resistencia", label: "雷西斯滕西亚" },
      { value: "Saenz Pena", label: "萨恩斯佩尼亚" },
      { value: "Villa Angela", label: "Villa Angela" },
    ] },
    { value: "Corrientes", label: "科连特斯省", cities: [
      { value: "Corrientes", label: "科连特斯" },
      { value: "Goya", label: "戈雅" },
      { value: "Paso de los Libres", label: "Paso de los Libres" },
    ] },
    { value: "Misiones", label: "米西奥内斯省", cities: [
      { value: "Posadas", label: "波萨达斯" },
      { value: "Obera", label: "奥贝拉" },
      { value: "Eldorado", label: "Eldorado" },
    ] },
    { value: "San Juan", label: "圣胡安省", cities: [
      { value: "San Juan", label: "圣胡安" },
      { value: "Rawson", label: "罗森" },
      { value: "Chimbas", label: "Chimbas" },
    ] },
    { value: "Jujuy", label: "胡胡伊省", cities: [
      { value: "San Salvador de Jujuy", label: "圣萨尔瓦多-德胡胡伊" },
      { value: "San Pedro de Jujuy", label: "胡胡伊圣佩德罗" },
      { value: "Palpala", label: "Palpala" },
    ] },
    { value: "Rio Negro", label: "里奥内格罗省", cities: [
      { value: "Bariloche", label: "巴里洛切" },
      { value: "Viedma", label: "别德马" },
      { value: "General Roca", label: "罗卡将军城" },
    ] },
    { value: "Neuquen", label: "内乌肯省", cities: [
      { value: "Neuquen", label: "内乌肯" },
      { value: "Centenario", label: "Centenario" },
      { value: "Cutral Co", label: "Cutral Co" },
    ] },
    { value: "Formosa", label: "福莫萨省", cities: [
      { value: "Formosa", label: "福莫萨" },
      { value: "Clorinda", label: "克洛林达" },
    ] },
    { value: "Chubut", label: "丘布特省", cities: [
      { value: "Rawson", label: "罗森" },
      { value: "Puerto Madryn", label: "马德林港" },
      { value: "Comodoro Rivadavia", label: "里瓦达维亚海军准将城" },
    ] },
    { value: "San Luis", label: "圣路易斯省", cities: [
      { value: "San Luis", label: "圣路易斯" },
      { value: "Villa Mercedes", label: "梅塞德斯镇" },
    ] },
    { value: "Catamarca", label: "卡塔马卡省", cities: [
      { value: "San Fernando del Valle de Catamarca", label: "卡塔马卡" },
      { value: "Belen", label: "Belen" },
    ] },
    { value: "La Rioja", label: "拉里奥哈省", cities: [
      { value: "La Rioja", label: "拉里奥哈" },
      { value: "Chilecito", label: "奇莱西托" },
    ] },
    { value: "La Pampa", label: "拉潘帕省", cities: [
      { value: "Santa Rosa", label: "圣罗莎" },
      { value: "General Pico", label: "皮科将军城" },
    ] },
    { value: "Santiago del Estero", label: "圣地亚哥-德尔埃斯特罗省", cities: [
      { value: "Santiago del Estero", label: "圣地亚哥-德尔埃斯特罗" },
      { value: "La Banda", label: "拉班达" },
    ] },
    { value: "Santa Cruz", label: "圣克鲁斯省", cities: [
      { value: "Rio Gallegos", label: "里奥加耶戈斯" },
      { value: "Caleta Olivia", label: "奥利维亚湾" },
    ] },
    { value: "Tierra del Fuego", label: "火地岛省", cities: [
      { value: "Ushuaia", label: "乌斯怀亚" },
      { value: "Rio Grande", label: "里奥格兰德" },
      { value: "Tolhuin", label: "Tolhuin" },
    ] },
    { value: "Ciudad Autonoma de Buenos Aires", label: "布宜诺斯艾利斯市", cities: [
      { value: "Buenos Aires", label: "布宜诺斯艾利斯" },
    ] },
  ],
  CL: [
    { value: "Arica y Parinacota", label: "阿里卡和帕里纳科塔大区", cities: [
      { value: "Arica", label: "阿里卡" },
    ] },
    { value: "Tarapaca", label: "塔拉帕卡大区", cities: [
      { value: "Iquique", label: "伊基克" },
      { value: "Alto Hospicio", label: "上奥斯皮西奥" },
    ] },
    { value: "Antofagasta", label: "安托法加斯塔大区", cities: [
      { value: "Antofagasta", label: "安托法加斯塔" },
      { value: "Calama", label: "卡拉马" },
      { value: "Tocopilla", label: "托科皮亚" },
    ] },
    { value: "Atacama", label: "阿塔卡马大区", cities: [
      { value: "Copiapo", label: "科皮亚波" },
      { value: "Vallenar", label: "巴耶纳尔" },
      { value: "Caldera", label: "卡尔德拉" },
    ] },
    { value: "Coquimbo", label: "科金博大区", cities: [
      { value: "La Serena", label: "拉塞雷纳" },
      { value: "Coquimbo", label: "科金博" },
      { value: "Ovalle", label: "奥瓦列" },
    ] },
    { value: "Valparaiso", label: "瓦尔帕莱索大区", cities: [
      { value: "Valparaiso", label: "瓦尔帕莱索" },
      { value: "Vina del Mar", label: "比尼亚德尔马" },
      { value: "Quilpue", label: "基尔普埃" },
    ] },
    { value: "Metropolitana de Santiago", label: "圣地亚哥首都大区", cities: [
      { value: "Santiago", label: "圣地亚哥" },
      { value: "Puente Alto", label: "Puente Alto" },
      { value: "San Bernardo", label: "圣贝纳多" },
    ] },
    { value: "O'Higgins", label: "奥希金斯大区", cities: [
      { value: "Rancagua", label: "兰卡瓜" },
      { value: "San Fernando", label: "圣费尔南多" },
      { value: "Rengo", label: "Rengo" },
    ] },
    { value: "Maule", label: "马乌莱大区", cities: [
      { value: "Talca", label: "塔尔卡" },
      { value: "Curico", label: "库里科" },
      { value: "Linares", label: "Linares" },
    ] },
    { value: "Nuble", label: "纽布莱大区", cities: [
      { value: "Chillan", label: "奇廉" },
      { value: "San Carlos", label: "San Carlos" },
    ] },
    { value: "Biobio", label: "比奥比奥大区", cities: [
      { value: "Concepcion", label: "康塞普西翁" },
      { value: "Talcahuano", label: "塔尔卡瓦诺" },
      { value: "Los Angeles", label: "Los Angeles" },
    ] },
    { value: "La Araucania", label: "阿劳卡尼亚大区", cities: [
      { value: "Temuco", label: "特木科" },
      { value: "Villarrica", label: "比利亚里卡" },
      { value: "Angol", label: "Angol" },
    ] },
    { value: "Los Rios", label: "河大区", cities: [
      { value: "Valdivia", label: "瓦尔迪维亚" },
      { value: "La Union", label: "La Union" },
    ] },
    { value: "Los Lagos", label: "湖大区", cities: [
      { value: "Puerto Montt", label: "蒙特港" },
      { value: "Osorno", label: "奥索尔诺" },
      { value: "Castro", label: "卡斯特罗" },
    ] },
    { value: "Aysen", label: "艾森大区", cities: [
      { value: "Coyhaique", label: "科伊艾克" },
      { value: "Puerto Aysen", label: "Puerto Aysen" },
    ] },
    { value: "Magallanes", label: "麦哲伦大区", cities: [
      { value: "Punta Arenas", label: "蓬塔阿雷纳斯" },
      { value: "Puerto Natales", label: "纳塔莱斯港" },
    ] },
  ],
  CO: [
    { value: "Bogota D.C.", label: "波哥大首都区", cities: [
      { value: "Bogota", label: "波哥大" },
    ] },
    { value: "Antioquia", label: "安蒂奥基亚省", cities: [
      { value: "Medellin", label: "麦德林" },
      { value: "Envigado", label: "恩维加多" },
      { value: "Bello", label: "贝略" },
      { value: "Itagui", label: "伊塔圭" },
    ] },
    { value: "Valle del Cauca", label: "考卡山谷省", cities: [
      { value: "Cali", label: "卡利" },
      { value: "Palmira", label: "帕尔米拉" },
      { value: "Buenaventura", label: "布埃纳文图拉" },
      { value: "Tulua", label: "图卢阿" },
    ] },
    { value: "Cundinamarca", label: "昆迪纳马卡省", cities: [
      { value: "Soacha", label: "索阿查" },
      { value: "Zipaquira", label: "锡帕基拉" },
      { value: "Facatativa", label: "法卡塔蒂瓦" },
    ] },
    { value: "Atlantico", label: "大西洋省", cities: [
      { value: "Barranquilla", label: "巴兰基亚" },
      { value: "Soledad", label: "索莱达" },
      { value: "Puerto Colombia", label: "Puerto Colombia" },
    ] },
    { value: "Bolivar", label: "玻利瓦尔省", cities: [
      { value: "Cartagena", label: "卡塔赫纳" },
      { value: "Magangue", label: "马甘格" },
      { value: "Turbaco", label: "Turbaco" },
    ] },
    { value: "Santander", label: "桑坦德省", cities: [
      { value: "Bucaramanga", label: "布卡拉曼加" },
      { value: "Floridablanca", label: "佛罗里达布兰卡" },
      { value: "Giron", label: "希龙" },
    ] },
    { value: "Boyaca", label: "博亚卡省", cities: [
      { value: "Tunja", label: "通哈" },
      { value: "Duitama", label: "杜伊塔马" },
      { value: "Sogamoso", label: "索加莫索" },
    ] },
    { value: "Tolima", label: "托利马省", cities: [
      { value: "Ibague", label: "伊瓦格" },
      { value: "Espinal", label: "埃斯皮纳尔" },
      { value: "Honda", label: "Honda" },
    ] },
    { value: "Huila", label: "乌伊拉省", cities: [
      { value: "Neiva", label: "内瓦" },
      { value: "Pitalito", label: "皮塔利托" },
      { value: "Garzon", label: "Garzon" },
    ] },
    { value: "Meta", label: "梅塔省", cities: [
      { value: "Villavicencio", label: "比亚维森西奥" },
      { value: "Acacias", label: "阿卡西亚斯" },
      { value: "Granada", label: "Granada" },
    ] },
    { value: "Narino", label: "纳里尼奥省", cities: [
      { value: "Pasto", label: "帕斯托" },
      { value: "Tumaco", label: "图马科" },
      { value: "Ipiales", label: "伊皮亚莱斯" },
    ] },
    { value: "Cordoba", label: "科尔多瓦省", cities: [
      { value: "Monteria", label: "蒙特里亚" },
      { value: "Lorica", label: "洛里卡" },
      { value: "Sahagun", label: "Sahagun" },
    ] },
    { value: "Sucre", label: "苏克雷省", cities: [
      { value: "Sincelejo", label: "辛塞莱霍" },
      { value: "Corozal", label: "科罗萨尔" },
      { value: "Tolu", label: "Tolu" },
    ] },
    { value: "Magdalena", label: "马格达莱纳省", cities: [
      { value: "Santa Marta", label: "圣玛尔塔" },
      { value: "Cienaga", label: "西埃纳加" },
      { value: "Aracataca", label: "Aracataca" },
    ] },
    { value: "Cesar", label: "塞萨尔省", cities: [
      { value: "Valledupar", label: "巴耶杜帕尔" },
      { value: "Aguachica", label: "阿瓜奇卡" },
      { value: "Agustin Codazzi", label: "Agustin Codazzi" },
    ] },
    { value: "Norte de Santander", label: "北桑坦德省", cities: [
      { value: "Cucuta", label: "库库塔" },
      { value: "Ocana", label: "奥卡尼亚" },
      { value: "Villa del Rosario", label: "罗萨里奥镇" },
    ] },
    { value: "Risaralda", label: "里萨拉尔达省", cities: [
      { value: "Pereira", label: "佩雷拉" },
      { value: "Dosquebradas", label: "多斯克布拉达斯" },
      { value: "Santa Rosa de Cabal", label: "圣罗莎德卡瓦尔" },
    ] },
    { value: "Caldas", label: "卡尔达斯省", cities: [
      { value: "Manizales", label: "马尼萨莱斯" },
      { value: "La Dorada", label: "拉多拉达" },
      { value: "Chinchina", label: "Chinchina" },
    ] },
    { value: "Quindio", label: "金迪奥省", cities: [
      { value: "Armenia", label: "亚美尼亚" },
      { value: "Calarca", label: "卡拉尔卡" },
      { value: "Montenegro", label: "蒙特内格罗" },
    ] },
    { value: "Cauca", label: "考卡省", cities: [
      { value: "Popayan", label: "波帕扬" },
      { value: "Santander de Quilichao", label: "基利乔圣坦德" },
      { value: "Puerto Tejada", label: "Puerto Tejada" },
    ] },
  ],
};
