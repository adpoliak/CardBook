if ("undefined" == typeof(wdw_cardbookContactsSidebar)) {
	Components.utils.import("resource:///modules/mailServices.js");
	Components.utils.import("resource://gre/modules/Services.jsm");
	Components.utils.import("chrome://cardbook/content/cardbookRepository.js");

	var CardBookResultsPaneObserver = {
		onDragStart: function (aEvent, aXferData, aDragAction) {
			var listOfEmails = wdw_cardbookContactsSidebar.getSelectedEmails();
			aXferData.data = new TransferData();
			aXferData.data.addDataForFlavour("text/x-moz-address", listOfEmails.join(", "));
			aXferData.data.addDataForFlavour("text/unicode", listOfEmails.join(", "));
			aDragAction.action = Components.interfaces.nsIDragService.DRAGDROP_ACTION_COPY;
		},
	
		onDrop: function (aEvent, aXferData, aDragSession) {},
		onDragExit: function (aEvent, aDragSession) {},
		onDragOver: function (aEvent, aFlavour, aDragSession) {},
		getSupportedFlavours: function () {
			return null;
		}
	};
	
	var wdw_cardbookContactsSidebar = {
		mutationObs: null,
		searchResults: [],
		ABInclRestrictions: {},
		ABExclRestrictions: {},
		catInclRestrictions: {},
		catExclRestrictions: {},

		sortTrees: function (aEvent) {
			if (aEvent.button != 0) {
				return;
			}
			var target = aEvent.originalTarget;
			if (target.localName == "treecol") {
				wdw_cardbookContactsSidebar.sortCardsTreeCol(target, "abResultsTree");
			}
		},

		sortCardsTreeCol: function (aColumn, aTreeName) {
			var myTree = document.getElementById(aTreeName);
			if (aColumn) {
				var listOfUid = [];
				var numRanges = myTree.view.selection.getRangeCount();
				var start = new Object();
				var end = new Object();
				for (var i = 0; i < numRanges; i++) {
					myTree.view.selection.getRangeAt(i,start,end);
					for (var j = start.value; j <= end.value; j++){
						listOfUid.push(myTree.view.getCellText(j, {id: aColumn.id}));
					}
				}
			}

			var columnName;
			var columnArray;
			var order = myTree.getAttribute("sortDirection") == "ascending" ? 1 : -1;
			
			// if the column is passed and it's already sorted by that column, reverse sort
			if (aColumn) {
				columnName = aColumn.id;
				if (myTree.getAttribute("sortResource") == columnName) {
					order *= -1;
				}
			} else {
				columnName = myTree.getAttribute("sortResource");
			}
			switch(columnName) {
				case "GeneratedName":
					columnArray=0;
					break;
				case "addrbook":
					columnArray=1;
					break;
				case "PrimaryEmail":
					columnArray=2;
					break;
			}
			var myData = wdw_cardbookContactsSidebar.searchResults;

			if (myData && myData.length) {
				myData = cardbookUtils.sortArrayByString(myData,columnArray,order);
			}

			//setting these will make the sort option persist
			myTree.setAttribute("sortDirection", order == 1 ? "ascending" : "descending");
			myTree.setAttribute("sortResource", columnName);
			
			wdw_cardbookContactsSidebar.displaySearchResults();
			
			//set the appropriate attributes to show to indicator
			var cols = myTree.getElementsByTagName("treecol");
			for (var i = 0; i < cols.length; i++) {
				cols[i].removeAttribute("sortDirection");
			}
			document.getElementById(columnName).setAttribute("sortDirection", order == 1 ? "ascending" : "descending");

			// select back
			if (aColumn) {
				for (var i = 0; i < listOfUid.length; i++) {
					for (var j = 0; j < myTree.view.rowCount; j++) {
						if (myTree.view.getCellText(j, {id: aColumn.id}) == listOfUid[i]) {
							myTree.view.selection.rangedSelect(j,j,true);
							break;
						}
					}
				}
			}
		},

		displaySearchResults: function () {
			var abResultsTreeView = {
				get rowCount() { return wdw_cardbookContactsSidebar.searchResults.length; },
				isContainer: function(idx) { return false },
				cycleHeader: function(idx) { return false },
				isEditable: function(idx, column) { return false },
				getCellText: function(idx, column) {
					if (column.id == "GeneratedName") return wdw_cardbookContactsSidebar.searchResults[idx][0];
					else if (column.id == "addrbook") return wdw_cardbookContactsSidebar.searchResults[idx][1];
					else if (column.id == "PrimaryEmail") return wdw_cardbookContactsSidebar.searchResults[idx][2];
				},
				getRowProperties: function(idx) {
					if (wdw_cardbookContactsSidebar.searchResults[idx] && wdw_cardbookContactsSidebar.searchResults[idx][3]) {
						return "MailList";
					}
				},
				getColumnProperties: function(column) { return column.id },
				getCellProperties: function(idx, column) { return this.getRowProperties(idx) + " " +  this.getColumnProperties(column)}
			}
			document.getElementById('abResultsTree').view = abResultsTreeView;
		},
		
		search: function () {
			if (document.getElementById('peopleSearchInput').value == "") {
				var strBundle = document.getElementById("cardbook-strings");
				document.getElementById('peopleSearchInput').placeholder = strBundle.getString("cardbookSearchInputDefault");
			}
			wdw_cardbookContactsSidebar.searchResults = [];
			var searchAB = document.getElementById('CardBookABMenulist').value;
			var searchCategory = document.getElementById('categoriesMenulist').value;
			var searchInput = document.getElementById("peopleSearchInput").value.replace(/[\s+\-+\.+\,+\;+]/g, "").toUpperCase();
			var useOnlyEmail = cardbookPreferences.getBoolPref("extensions.cardbook.useOnlyEmail");
			for (var i = 0; i < cardbookRepository.cardbookAccounts.length; i++) {
				if (cardbookRepository.cardbookAccounts[i][1] && cardbookRepository.cardbookAccounts[i][5]) {
					var myDirPrefId = cardbookRepository.cardbookAccounts[i][4];
					if (cardbookRepository.cardbookAccounts[i][6] != "SEARCH") {
						if (cardbookRepository.verifyABRestrictions(myDirPrefId, searchAB, wdw_cardbookContactsSidebar.ABExclRestrictions, wdw_cardbookContactsSidebar.ABInclRestrictions)) {
							var myDirPrefName = cardbookUtils.getPrefNameFromPrefId(myDirPrefId);
							// All No Only categories
							if ((searchCategory === "allCategories") || (searchCategory === "noCategory") || (searchCategory === "onlyCategories")) {
								if (searchCategory !== "onlyCategories") {
									for (var j in cardbookRepository.cardbookCardLongSearch[myDirPrefId]) {
										if (j.includes(searchInput) || searchInput == "") {
											for (var k = 0; k < cardbookRepository.cardbookCardLongSearch[myDirPrefId][j].length; k++) {
												var myCard = cardbookRepository.cardbookCardLongSearch[myDirPrefId][j][k];
												if (wdw_cardbookContactsSidebar.catExclRestrictions[myDirPrefId]) {
													var add = true;
													for (var l in wdw_cardbookContactsSidebar.catExclRestrictions[myDirPrefId]) {
														if (myCard.categories.includes(l)) {
															add = false;
															break;
														}
													}
													if (!add) {
														continue;
													}
												}
												if (wdw_cardbookContactsSidebar.catInclRestrictions[myDirPrefId]) {
													var add = false;
													for (var l in wdw_cardbookContactsSidebar.catInclRestrictions[myDirPrefId]) {
														if (myCard.categories.includes(l)) {
															add = true;
															break;
														}
													}
													if (!add) {
														continue;
													}
												}
												if (myCard.isAList) {
													wdw_cardbookContactsSidebar.searchResults.push([myCard.fn, myDirPrefName,"", true, "LISTCARDBOOK", myCard, MailServices.headerParser.makeMimeAddress(myCard.fn, myCard.fn), '']);
												} else {
													if (myCard.emails != "") {
														var myFormattedEmails = [];
														myFormattedEmails = cardbookUtils.getMimeEmailsFromCards([myCard], useOnlyEmail);
														wdw_cardbookContactsSidebar.searchResults.push([myCard.fn, myDirPrefName, myCard.emails.join(', '), false, "CARDCARDBOOK", myCard, myFormattedEmails.join('@@@@@'), '']);
													}
												}
											}
										}
									}
								}
								if (searchCategory !== "noCategory") {
									for (var j = 0; j < cardbookRepository.cardbookAccountsCategories[myDirPrefId].length; j++) {
										var myCategory = cardbookRepository.cardbookAccountsCategories[myDirPrefId][j];
										if (cardbookRepository.verifyCatRestrictions(myDirPrefId, myCategory, searchInput, wdw_cardbookContactsSidebar.ABExclRestrictions,
																					wdw_cardbookContactsSidebar.catExclRestrictions, wdw_cardbookContactsSidebar.catInclRestrictions)) {
											var myEmails = [] ;
											var myFormattedEmails = [];
											for (var k = 0; k < cardbookRepository.cardbookDisplayCards[myDirPrefId+"::"+myCategory].length; k++) {
												var myCard = cardbookRepository.cardbookDisplayCards[myDirPrefId+"::"+myCategory][k];
												if (myCard.isAList) {
													myEmails.push(myCard.fn);
													myFormattedEmails.push(MailServices.headerParser.makeMimeAddress(myCard.fn, myCard.fn));
												} else {
													myEmails = myEmails.concat(myCard.emails);
													myFormattedEmails = myFormattedEmails.concat(cardbookUtils.getMimeEmailsFromCards([myCard], useOnlyEmail));
												}
											}
											if (myEmails != "") {
												wdw_cardbookContactsSidebar.searchResults.push([myCategory, myDirPrefName, myEmails.join(', '), true, "CATCARDBOOK", myDirPrefId+"::"+myCategory, myFormattedEmails.join('@@@@@'), '']);
											}
										}
									}
								}
							// One category
							} else {
								var mySepPosition = searchCategory.indexOf("::",0);
								var myCategory = searchCategory.substr(mySepPosition+2,searchCategory.length);
								function searchArray(element) {
									return element == myCategory;
								};
								for (var j in cardbookRepository.cardbookCardLongSearch[myDirPrefId]) {
									if (j.includes(searchInput) || searchInput == "") {
										for (var k = 0; k < cardbookRepository.cardbookCardLongSearch[myDirPrefId][j].length; k++) {
											var myCard = cardbookRepository.cardbookCardLongSearch[myDirPrefId][j][k]
											if (((myCard.categories.find(searchArray) != undefined) && (cardbookRepository.cardbookUncategorizedCards != myCategory))
												|| ((myCard.categories.length == 0) && (cardbookRepository.cardbookUncategorizedCards == myCategory))) {
												if (wdw_cardbookContactsSidebar.catExclRestrictions[myDirPrefId]) {
													var add = true;
													for (var l in wdw_cardbookContactsSidebar.catExclRestrictions[myDirPrefId]) {
														if (myCard.categories.includes(l)) {
															add = false;
															break;
														}
													}
													if (!add) {
														continue;
													}
												}
												if (myCard.isAList) {
													wdw_cardbookContactsSidebar.searchResults.push([myCard.fn, myDirPrefName,"", true, "LISTCARDBOOK", myCard, MailServices.headerParser.makeMimeAddress(myCard.fn, myCard.fn), '']);
												} else {
													if (myCard.emails != "") {
														var myFormattedEmails = [];
														myFormattedEmails = cardbookUtils.getMimeEmailsFromCards([myCard], useOnlyEmail);
														wdw_cardbookContactsSidebar.searchResults.push([myCard.fn, myDirPrefName, myCard.emails.join(', '), false, "CARDCARDBOOK", myCard, myFormattedEmails.join('@@@@@'), '']);
													}
												}
											}
										}
									}
								}
								if (myCategory.replace(/[\s+\-+\.+\,+\;+]/g, "").toUpperCase().includes(searchInput) || searchInput == "") {
									var myEmails = [] ;
									var myFormattedEmails = [];
									for (var k = 0; k < cardbookRepository.cardbookDisplayCards[searchCategory].length; k++) {
										var myCard = cardbookRepository.cardbookDisplayCards[searchCategory][k];
										if (wdw_cardbookContactsSidebar.catExclRestrictions[myDirPrefId]) {
											var add = true;
											for (var l in wdw_cardbookContactsSidebar.catExclRestrictions[myDirPrefId]) {
												if (myCard.categories.includes(l)) {
													add = false;
													break;
												}
											}
											if (!add) {
												continue;
											}
										}
										if (myCard.isAList) {
											myEmails.push(myCard.fn);
											myFormattedEmails.push(MailServices.headerParser.makeMimeAddress(myCard.fn, myCard.fn));
										} else {
											myEmails = myEmails.concat(myCard.emails);
											myFormattedEmails = myFormattedEmails.concat(cardbookUtils.getMimeEmailsFromCards([myCard], useOnlyEmail));
										}
									}
									if (myEmails != "") {
										wdw_cardbookContactsSidebar.searchResults.push([myCategory, myDirPrefName, myEmails.join(', '), true, "CATCARDBOOK", searchCategory, myFormattedEmails.join('@@@@@'), '']);
									}
								}
							}
						}
					// complex searches
					} else if ((cardbookRepository.cardbookAccounts[i][6] === "SEARCH") && ((searchAB == myDirPrefId))) {
						if (cardbookRepository.verifyABRestrictions(myDirPrefId, searchAB, wdw_cardbookContactsSidebar.ABExclRestrictions, wdw_cardbookContactsSidebar.ABInclRestrictions)) {
							// first add cards
							if ((searchCategory === "allCategories") || (searchCategory === "noCategory") || (searchCategory === "onlyCategories")) {
								for (var j = 0; j < cardbookRepository.cardbookDisplayCards[myDirPrefId].length; j++) {
									// All No categories
									if (searchCategory !== "onlyCategories") {
										var myCard = cardbookRepository.cardbookDisplayCards[myDirPrefId][j];
										var myDirPrefName = cardbookUtils.getPrefNameFromPrefId(myCard.dirPrefId);
										if (cardbookRepository.getLongSearchString(myCard).includes(searchInput) || searchInput == "") {
											if (wdw_cardbookContactsSidebar.catExclRestrictions[myDirPrefId]) {
												var add = true;
												for (var l in wdw_cardbookContactsSidebar.catExclRestrictions[myDirPrefId]) {
													if (myCard.categories.includes(l)) {
														add = false;
														break;
													}
												}
												if (!add) {
													continue;
												}
											}
											if (wdw_cardbookContactsSidebar.catInclRestrictions[myDirPrefId]) {
												var add = false;
												for (var l in wdw_cardbookContactsSidebar.catInclRestrictions[myDirPrefId]) {
													if (myCard.categories.includes(l)) {
														add = true;
														break;
													}
												}
												if (!add) {
													continue;
												}
											}
											if (myCard.isAList) {
												wdw_cardbookContactsSidebar.searchResults.push([myCard.fn, myDirPrefName,"", true, "LISTCARDBOOK", myCard, MailServices.headerParser.makeMimeAddress(myCard.fn, myCard.fn), '']);
											} else {
												if (myCard.emails != "") {
													var myFormattedEmails = [];
													myFormattedEmails = cardbookUtils.getMimeEmailsFromCards([myCard], useOnlyEmail);
													wdw_cardbookContactsSidebar.searchResults.push([myCard.fn, myDirPrefName, myCard.emails.join(', '), false, "CARDCARDBOOK", myCard, myFormattedEmails.join('@@@@@'), '']);
												}
											}
										}
									}
								}
							// one category
							} else {
								var mySepPosition = searchCategory.indexOf("::",0);
								var myCategory = searchCategory.substr(mySepPosition+2,searchCategory.length);
								for (var j = 0; j < cardbookRepository.cardbookDisplayCards[myDirPrefId+'::'+myCategory].length; j++) {
									var myCard = cardbookRepository.cardbookDisplayCards[myDirPrefId+'::'+myCategory][j];
									var myDirPrefName = cardbookUtils.getPrefNameFromPrefId(myCard.dirPrefId);
									// All No categories
									if (searchCategory !== "onlyCategories") {
										if (cardbookRepository.getLongSearchString(myCard).includes(searchInput) || searchInput == "") {
											if (wdw_cardbookContactsSidebar.catExclRestrictions[myDirPrefId]) {
												var add = true;
												for (var l in wdw_cardbookContactsSidebar.catExclRestrictions[myDirPrefId]) {
													if (myCard.categories.includes(l)) {
														add = false;
														break;
													}
												}
												if (!add) {
													continue;
												}
											}
											if (wdw_cardbookContactsSidebar.catInclRestrictions[myDirPrefId]) {
												var add = false;
												for (var l in wdw_cardbookContactsSidebar.catInclRestrictions[myDirPrefId]) {
													if (myCard.categories.includes(l)) {
														add = true;
														break;
													}
												}
												if (!add) {
													continue;
												}
											}
											if (myCard.isAList) {
												wdw_cardbookContactsSidebar.searchResults.push([myCard.fn, myDirPrefName,"", true, "LISTCARDBOOK", myCard, MailServices.headerParser.makeMimeAddress(myCard.fn, myCard.fn), '']);
											} else {
												if (myCard.emails != "") {
													var myFormattedEmails = [];
													myFormattedEmails = cardbookUtils.getMimeEmailsFromCards([myCard], useOnlyEmail);
													wdw_cardbookContactsSidebar.searchResults.push([myCard.fn, myDirPrefName, myCard.emails.join(', '), false, "CARDCARDBOOK", myCard, myFormattedEmails.join('@@@@@'), '']);
												}
											}
										}
									}
								}
							}
						}
						// then add categories
						if (searchCategory !== "noCategory") {
							for (var j = 0; j < cardbookRepository.cardbookAccountsCategories[myDirPrefId].length; j++) {
								var myCategory = cardbookRepository.cardbookAccountsCategories[myDirPrefId][j];
								if (cardbookRepository.verifyCatRestrictions(myDirPrefId, myCategory, searchInput, wdw_cardbookContactsSidebar.ABExclRestrictions,
																			wdw_cardbookContactsSidebar.catExclRestrictions, wdw_cardbookContactsSidebar.catInclRestrictions)) {
									if ((searchCategory !== "allCategories") && (searchCategory !== "noCategory") && (searchCategory !== "onlyCategories")) {
										if (myDirPrefId+'::'+myCategory != searchCategory) {
											continue;
										}
									}
									var myEmails = [] ;
									var myFormattedEmails = [];
									for (var k = 0; k < cardbookRepository.cardbookDisplayCards[myDirPrefId+"::"+myCategory].length; k++) {
										var myCard = cardbookRepository.cardbookDisplayCards[myDirPrefId+"::"+myCategory][k];
										if (myCard.isAList) {
											myEmails.push(myCard.fn);
											myFormattedEmails.push(MailServices.headerParser.makeMimeAddress(myCard.fn, myCard.fn));
										} else {
											myEmails = myEmails.concat(myCard.emails);
											myFormattedEmails = myFormattedEmails.concat(cardbookUtils.getMimeEmailsFromCards([myCard], useOnlyEmail));
										}
									}
									if (myEmails != "") {
										wdw_cardbookContactsSidebar.searchResults.push([myCategory, myDirPrefName, myEmails.join(', '), true, "CATCARDBOOK", myDirPrefId+"::"+myCategory, myFormattedEmails.join('@@@@@'), '']);
									}
								}
							}
						}
						break;
					}
				}
			}
			if (!cardbookPreferences.getBoolPref("extensions.cardbook.exclusive")) {
				var contactManager = MailServices.ab;
				var contacts = contactManager.directories;
				while ( contacts.hasMoreElements() ) {
					var contact = contacts.getNext().QueryInterface(Components.interfaces.nsIAbDirectory);
					if (cardbookRepository.verifyABRestrictions(contact.dirPrefId, searchAB, wdw_cardbookContactsSidebar.ABExclRestrictions, wdw_cardbookContactsSidebar.ABInclRestrictions)) {
						var abCardsEnumerator = contact.childCards;
						while (abCardsEnumerator.hasMoreElements()) {
							var myABCard = abCardsEnumerator.getNext();
							myABCard = myABCard.QueryInterface(Components.interfaces.nsIAbCard);
							var myPrimaryEmail = myABCard.getProperty("PrimaryEmail","");
							var myDisplayName = myABCard.getProperty("DisplayName","");
							if (!myABCard.isMailList) {
								if (myPrimaryEmail != "") {
									var lSearchString = myABCard.getProperty("FirstName","") + myABCard.getProperty("LastName","") + myDisplayName + myABCard.getProperty("NickName","") + myPrimaryEmail;
									lSearchString = lSearchString.replace(/[\s+\-+\.+\,+\;+]/g, "").toUpperCase();
									if (lSearchString.includes(searchInput) || searchInput == "") {
										if (myDisplayName == "") {
											var delim = myPrimaryEmail.indexOf("@",0);
											myDisplayName = myPrimaryEmail.substr(0,delim);
										}
										if (useOnlyEmail) {
											wdw_cardbookContactsSidebar.searchResults.push([myDisplayName, contact.dirName, myPrimaryEmail, false, "CARDCORE", myABCard, myPrimaryEmail, contact.dirPrefId]);
										} else {
											wdw_cardbookContactsSidebar.searchResults.push([myDisplayName, contact.dirName, myPrimaryEmail, false, "CARDCORE", myABCard, MailServices.headerParser.makeMimeAddress(myDisplayName, myPrimaryEmail), contact.dirPrefId]);
										}
									}
								}
							} else {
								var myABList = contactManager.getDirectory(myABCard.mailListURI);
								var lSearchString = myDisplayName + myABList.listNickName + myABList.description;
								lSearchString = lSearchString.replace(/[\s+\-+\.+\,+\;+]/g, "").toUpperCase();
								if (lSearchString.includes(searchInput) || searchInput == "") {
										wdw_cardbookContactsSidebar.searchResults.push([myDisplayName, contact.dirName, "", true, "LISTCORE", myABCard, MailServices.headerParser.makeMimeAddress(myDisplayName, myDisplayName), contact.dirPrefId]);
								}
							}
						}
					}
				}
			}
			wdw_cardbookContactsSidebar.sortCardsTreeCol(null, "abResultsTree");
		},

		addEmails: function (aType) {
			var listOfEmails = wdw_cardbookContactsSidebar.getSelectedEmails();
			for (var i = 0; i < listOfEmails.length; i++) {
				parent.AddRecipient(aType, listOfEmails[i]);
			}
		},

		startDrag: function (aEvent) {
			try {
				var listOfEmails = wdw_cardbookContactsSidebar.getSelectedEmails();
				for (var i = 0; i < listOfEmails.length; i++) {
					aEvent.dataTransfer.mozSetDataAt("text/plain", listOfEmails[i], i);
				}
				// aEvent.dataTransfer.setData("text/plain", listOfEmails);
			}
			catch (e) {
				wdw_cardbooklog.updateStatusProgressInformation("wdw_cardbookContactsSidebar.startDrag error : " + e, "Error");
			}
		},

		getSelectedEmails: function () {
			var myTree = document.getElementById('abResultsTree');
			var listOfEmails = [];
			var numRanges = myTree.view.selection.getRangeCount();
			var start = new Object();
			var end = new Object();
			for (var i = 0; i < numRanges; i++) {
				myTree.view.selection.getRangeAt(i,start,end);
				for (var j = start.value; j <= end.value; j++){
					var allEmails = [];
					allEmails = wdw_cardbookContactsSidebar.searchResults[j][6].split('@@@@@');
					for (var k = 0; k < allEmails.length; k++) {
						listOfEmails.push(allEmails[k]);
					}
				}
			}
			return listOfEmails;
		},

		getSelectedCards: function () {
			var myTree = document.getElementById('abResultsTree');
			var listOfUid = [];
			var numRanges = myTree.view.selection.getRangeCount();
			var start = new Object();
			var end = new Object();
			for (var i = 0; i < numRanges; i++) {
				myTree.view.selection.getRangeAt(i,start,end);
				for (var j = start.value; j <= end.value; j++){
					listOfUid.push([wdw_cardbookContactsSidebar.searchResults[j][4], wdw_cardbookContactsSidebar.searchResults[j][5], wdw_cardbookContactsSidebar.searchResults[j][7]]);
				}
			}
			return listOfUid;
		},

		doubleClickCardsTree: function (aEvent) {
			var myTree = document.getElementById('abResultsTree');
			if (myTree.currentIndex != -1) {
				var row = { }, col = { }, child = { };
				myTree.treeBoxObject.getCellAt(aEvent.clientX, aEvent.clientY, row, col, child);
				if (row.value != -1) {
					wdw_cardbookContactsSidebar.addEmails('addr_to');
				}
			}
		},

		deleteCard: function () {
			var listOfUid = wdw_cardbookContactsSidebar.getSelectedCards();
			var AB =  MailServices.ab.getDirectoryFromId(listOfUid[0][2]);
			for (var i = 0; i < listOfUid.length; i++) {
				if (listOfUid[i][0] === "CARDCARDBOOK" || listOfUid[i][0] === "LISTCARDBOOK") {
					wdw_cardbook.deleteCardsAndValidate("cardbook.cardRemovedIndirect", [listOfUid[i][1]]);
				} else if (listOfUid[i][0] === "CATCARDBOOK") {
					var myCatArray = listOfUid[i][1].split("::");
					wdw_cardbook.removeCategory(myCatArray[0], myCatArray[1], "cardbook.catRemovedIndirect", false);
				} else if (listOfUid[i][0] === "LISTCORE") {
					gAddressBookBundle = document.getElementById("bundle_addressBook");
					var myCard = listOfUid[i][1];
					AbDeleteDirectory(myCard.mailListURI);
				} else if (listOfUid[i][0] === "CARDCORE") {
					gAddressBookBundle = document.getElementById("bundle_addressBook");
					var myCard = listOfUid[i][1];
					try {
						var confirmDeleteMessage = gAddressBookBundle.getString("confirmDeleteContact");
						var confirmDeleteTitle = null;
					}
					// for new Thunderbird versions
					catch (e) {
						var confirmDeleteMessage = gAddressBookBundle.getString("confirmDeleteThisContact");
						confirmDeleteMessage = confirmDeleteMessage.replace("#1", myCard.displayName);
						var confirmDeleteTitle = gAddressBookBundle.getString("confirmDeleteThisContactTitle");
					}
					if (Services.prompt.confirm(window, confirmDeleteTitle, confirmDeleteMessage)) {
						let cardArray = Components.classes["@mozilla.org/array;1"].createInstance(Components.interfaces.nsIMutableArray);
						cardArray.appendElement(myCard, false);
						AB.deleteCards(cardArray);
					}
				}
			}
			wdw_cardbookContactsSidebar.search();
		},

		editCard: function () {
			var listOfUid = wdw_cardbookContactsSidebar.getSelectedCards();
			var AB =  MailServices.ab.getDirectoryFromId(listOfUid[0][2]);
			if (listOfUid[0][0] === "CARDCARDBOOK" || listOfUid[0][0] === "LISTCARDBOOK") {
				var myCard = listOfUid[0][1];
				var myOutCard = new cardbookCardParser();
				cardbookUtils.cloneCard(myCard, myOutCard);
				if (myOutCard.isAList) {
					var myType = "List";
				} else {
					var myType = "Contact";
				}
				if (cardbookPreferences.getReadOnly(myCard.dirPrefId)) {
					cardbookUtils.openEditionWindow(myOutCard, "View" + myType);
				} else {
					cardbookUtils.openEditionWindow(myOutCard, "Edit" + myType, "cardbook.cardModifiedIndirect");
				}
			} else if (listOfUid[0][0] === "CARDCORE") {
				var myCard = listOfUid[0][1];
				goEditCardDialog(AB.URI, myCard);
			} else if (listOfUid[0][0] === "LISTCORE") {
				var myCard = listOfUid[0][1];
				try {
					goEditListDialog(myCard, myCard.mailListURI);
				}
				catch (e) {
				}
			} else if (listOfUid[0][0] === "CATCARDBOOK") {
				var myCatArray = listOfUid[0][1].split("::");
				wdw_cardbook.renameCategory(myCatArray[0], myCatArray[1], "cardbook.catModifiedIndirect", false);
			}
			wdw_cardbookContactsSidebar.search();
		},

		selectAllKey: function () {
			var myTree = document.getElementById('abResultsTree');
			myTree.view.selection.selectAll();
		},

		cardPropertiesMenuContextShowing: function () {
			if (cardbookUtils.displayColumnsPicker()) {
				wdw_cardbookContactsSidebar.cardPropertiesMenuContextShowingNext();
				return true;
			} else {
				return false;
			}
		},

		cardPropertiesMenuContextShowingNext: function () {
			var listOfUid = wdw_cardbookContactsSidebar.getSelectedCards();
			if (listOfUid.length != 0) {
				if (listOfUid.length != 1) {
					document.getElementById("editCard").disabled=true;
				} else {
					if (listOfUid[0][0] == "CATCARDBOOK") {
						var myAccountArray = listOfUid[0][1].split("::");
						var myDirPrefId = myAccountArray[0];
						if (cardbookPreferences.getReadOnly(myDirPrefId)) {
							wdw_cardbookContactsSidebar.disableCardModification();
						} else {
							wdw_cardbookContactsSidebar.enableCardModification();
						}
					} else if (listOfUid[0][0] == "CARDCARDBOOK" || listOfUid[0][0] == "LISTCARDBOOK") {
						var myDirPrefId = listOfUid[0][1].dirPrefId;
						if (cardbookPreferences.getReadOnly(myDirPrefId)) {
							wdw_cardbookContactsSidebar.disableCardModification();
						} else {
							wdw_cardbookContactsSidebar.enableCardModification();
						}
					} else {
						wdw_cardbookContactsSidebar.enableCardModification();
					}
				}
				document.getElementById("toEmail").disabled=false;
				document.getElementById("ccEmail").disabled=false;
				document.getElementById("bccEmail").disabled=false;
				document.getElementById("replytoEmail").disabled=false;
			} else {
				document.getElementById("toEmail").disabled=true;
				document.getElementById("ccEmail").disabled=true;
				document.getElementById("bccEmail").disabled=true;
				document.getElementById("replytoEmail").disabled=true;
				wdw_cardbookContactsSidebar.disableCardModification();
			}
		},

		disableCardModification: function () {
			document.getElementById("editCard").disabled=true;
			document.getElementById("deleteCard").disabled=true;
		},
		
		enableCardModification: function () {
			document.getElementById("editCard").disabled=false;
			document.getElementById("deleteCard").disabled=false;
		},
		
		loadPanel: function () {
			myCardBookSideBarObserver.register();
			myCardBookSideBarPrefObserver.register();
			document.title = parent.document.getElementById("sidebar-title").value;
			wdw_cardbookContactsSidebar.waitForMsgIdentityFinished();
		},
		
		unloadPanel: function () {
			myCardBookSideBarObserver.unregister();
			myCardBookSideBarPrefObserver.unregister();
		},
		
		loadRestrictions: function () {
			var outerID = content.QueryInterface(Components.interfaces.nsIInterfaceRequestor).getInterface(Components.interfaces.nsIDOMWindowUtils).outerWindowID;
			var msgIdentity = cardbookRepository.composeMsgIdentity[outerID];
			var result = [];
			result = cardbookPreferences.getAllRestrictions();
			wdw_cardbookContactsSidebar.ABInclRestrictions = {};
			wdw_cardbookContactsSidebar.ABExclRestrictions = {};
			wdw_cardbookContactsSidebar.catInclRestrictions = {};
			wdw_cardbookContactsSidebar.catExclRestrictions = {};
			if (msgIdentity == "") {
				wdw_cardbookContactsSidebar.ABInclRestrictions["length"] = 0;
				return;
			}
			for (var i = 0; i < result.length; i++) {
				var resultArray = result[i].split("::");
				if ((resultArray[0] == "true") && ((resultArray[2] == msgIdentity) || (resultArray[2] == "allMailAccounts"))) {
					if (resultArray[1] == "include") {
						wdw_cardbookContactsSidebar.ABInclRestrictions[resultArray[3]] = 1;
						if (resultArray[4] && resultArray[4] != null && resultArray[4] !== undefined && resultArray[4] != "") {
							if (!(wdw_cardbookContactsSidebar.catInclRestrictions[resultArray[3]])) {
								wdw_cardbookContactsSidebar.catInclRestrictions[resultArray[3]] = {};
							}
							wdw_cardbookContactsSidebar.catInclRestrictions[resultArray[3]][resultArray[4]] = 1;
						}
					} else {
						if (resultArray[4] && resultArray[4] != null && resultArray[4] !== undefined && resultArray[4] != "") {
							if (!(wdw_cardbookContactsSidebar.catExclRestrictions[resultArray[3]])) {
								wdw_cardbookContactsSidebar.catExclRestrictions[resultArray[3]] = {};
							}
							wdw_cardbookContactsSidebar.catExclRestrictions[resultArray[3]][resultArray[4]] = 1;
						} else {
							wdw_cardbookContactsSidebar.ABExclRestrictions[resultArray[3]] = 1;
						}
					}
				}
			}
			wdw_cardbookContactsSidebar.ABInclRestrictions["length"] = cardbookUtils.sumElements(wdw_cardbookContactsSidebar.ABInclRestrictions);
		},
		
		loadAB: function () {
			wdw_cardbookContactsSidebar.loadRestrictions();
			var ABList = document.getElementById('CardBookABMenulist');
			if (ABList.value != null && ABList.value !== undefined && ABList.value != "") {
				var ABDefaultValue = ABList.value;
			} else {
				var ABDefaultValue = 0;
			}
			cardbookElementTools.loadAddressBooks("CardBookABMenupopup", "CardBookABMenulist", ABDefaultValue, cardbookPreferences.getBoolPref("extensions.cardbook.exclusive"), true, true, true,
													wdw_cardbookContactsSidebar.ABInclRestrictions, wdw_cardbookContactsSidebar.ABExclRestrictions);
			wdw_cardbookContactsSidebar.onABChange();
			
			var strBundle = document.getElementById("cardbook-strings");
			document.getElementById('peopleSearchInput').placeholder = strBundle.getString("cardbookSearchInputDefault");
		},
		
		onABChange: function () {
			var addrbookColumn = document.getElementById("addrbook");
			if (document.getElementById('CardBookABMenulist').selectedItem.value != "allAddressBooks" && document.getElementById('CardBookABMenulist').selectedItem.getAttribute("ABtype") != "search") {
				addrbookColumn.setAttribute('hidden', 'true');
				addrbookColumn.setAttribute('ignoreincolumnpicker', "true");
			} else {
				addrbookColumn.removeAttribute('hidden');
				addrbookColumn.removeAttribute('ignoreincolumnpicker');
			}

			var ABList = document.getElementById('CardBookABMenulist').selectedItem;
			if (ABList.value != null && ABList.value !== undefined && ABList.value != "") {
				var ABDefaultValue = ABList.value;
			} else {
				var ABDefaultValue = 0;
			}
			var categoryList = document.getElementById('categoriesMenulist');
			if (categoryList.value != null && categoryList.value !== undefined && categoryList.value != "") {
				var categoryDefaultValue = categoryList.value;
			} else {
				var categoryDefaultValue = 0;
			}
			cardbookElementTools.loadCategories("categoriesMenupopup", "categoriesMenulist", ABDefaultValue, categoryDefaultValue, true, true, true, false,
												wdw_cardbookContactsSidebar.catInclRestrictions, wdw_cardbookContactsSidebar.catExclRestrictions);
			
			if (document.getElementById('categoriesMenulist').itemCount == 3) {
				document.getElementById('categoriesPickerLabel').setAttribute('hidden', 'true');
				document.getElementById('categoriesMenulist').setAttribute('hidden', 'true');
			} else {
				document.getElementById('categoriesPickerLabel').removeAttribute('hidden');
				document.getElementById('categoriesMenulist').removeAttribute('hidden');
			}
			
			wdw_cardbookContactsSidebar.search();
		},

		// works only when the restrictions are changed
		onRestrictionsChanged: function () {
			wdw_cardbookContactsSidebar.loadAB();
		},
		
		// works only when the identity is changed, not for the initial start
		onIdentityChanged: function (aWindowId) {
			var outerID = content.QueryInterface(Components.interfaces.nsIInterfaceRequestor).getInterface(Components.interfaces.nsIDOMWindowUtils).outerWindowID;
			if (aWindowId == outerID) {
				wdw_cardbookContactsSidebar.loadAB();
			}
		},
		
		// works only for the initial start, not when the identity is changed
		waitForMsgIdentityFinished: function () {
			var lTimerMsgIdentity = Components.classes["@mozilla.org/timer;1"].createInstance(Components.interfaces.nsITimer);
			lTimerMsgIdentity.initWithCallback({ notify: function(lTimerMsgIdentity) {
						var outerID = content.QueryInterface(Components.interfaces.nsIInterfaceRequestor).getInterface(Components.interfaces.nsIDOMWindowUtils).outerWindowID;
						if (cardbookRepository.composeMsgIdentity[outerID]) {
								wdw_cardbookContactsSidebar.loadAB();
								lTimerMsgIdentity.cancel();
							}
						}
					}, 1000, Components.interfaces.nsITimer.TYPE_REPEATING_SLACK);
		},
		
		onCategoryChange: function () {
			wdw_cardbookContactsSidebar.search();
		}
		
	}
};
