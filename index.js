/**************CONFIG***********************************/
var GELBGRENZE = config.GELBGRENZE; // nach wie vielen Tagen wird es gelb
const ROTGRENZE = config.ROTGRENZE; // nach wie vielen Tagen wird es rot
const BESTEHENDEKUERZEL = config.BESTEHENDEKUERZEL; // Kürzel der Techniker, die immer existieren
const KUERZELLAENGE = config.KUERZELLAENGE; // maximale länge der Kürzel
const BackupIntervalle = config.BackupIntervalle; // Automatische Backup Intervalle in Millisekunden
const backupFrequency = config.backupFrequency; // Wert aus BackupIntervalle wählen
const LOG = config.LOG; // Fehlermeldungen in der Konsole anzeigen, false lassen
/*******************************************************/


//Damit Barcode nicht Tastaureingaben auslöst
const loeschInput = ["Shift", "Control", "Alt", "Meta", "/"];
const techArr = populateTechnicianArrayfromLocalStorage();
let rentedItems = new Map();

console.clear();

window.onload = function() {
    loadTechnicianData();
    setPrios();
    sortTechniciansByPriority();
    loadTechnicianData();
    updateTimeDisplay();
    updateColor();
    updateMap();
    autoExportBackup();
};

class Technician {
    constructor(initials) {
        this.initials = initials;
        this.rentalObjects = [];
        this.prio = -1;
    }

    addRentalObject(rentalObject) {
        this.rentalObjects.push(rentalObject);
        rentedItems.set(rentalObject.serialNumber, this.initials);
    }

    removeRentalObject(serialNumber) {
        this.rentalObjects = this.rentalObjects.filter(
            (rentalObject) => rentalObject.serialNumber !== serialNumber
        );
        rentedItems.delete(serialNumber);
    }
    getMaxPriority() {
        if (this.rentalObjects.length === 0) {
            return -1;
        }
        return Math.max(...this.rentalObjects.map((obj) => obj.getDays()));
    }

    setPrio() {
        this.prio = this.getMaxPriority();
    }
}

class RentalObject {
    constructor(serialNumber, dateScanned, arzt) {
        this.serialNumber = serialNumber;
        this.dateScanned = dateScanned;
        this.arzt = arzt;
    }
    toJSON() {
        return {
            serialNumber: this.serialNumber,
            dateScanned: this.dateScanned,
            arzt: this.arzt,
        };
    }
    getDateScanned() {
        const currentDate = new Date();
        const scannedDate = new Date(this.dateScanned);
        const diffInMilliseconds = currentDate - scannedDate;
        const diffInSeconds = Math.floor(diffInMilliseconds / 1000);
        const diffInMinutes = Math.floor(diffInSeconds / 60);
        const diffInHours = Math.floor(diffInMinutes / 60);
        const diffInDays = Math.floor(diffInHours / 24);

        if (diffInSeconds < 60) {
            return "Gerade Jetzt";
        } else if (diffInMinutes < 60) {
            return diffInMinutes + (diffInMinutes === 1 ? " Minute" : " Minuten");
        } else if (diffInHours < 24) {
            return diffInHours + (diffInHours === 1 ? " Stunde" : " Stunden");
        } else {
            return diffInDays + (diffInDays === 1 ? " Tag" : " Tage");
        }
    }

    getArzt() {
        return this.arzt;
    }

    getDays() {
        let now = Date.now();

        let scannedDate = new Date(this.dateScanned).getTime();
        let difference = now - scannedDate;

        return Math.floor(difference / 1000);
    }

    getPriority() {
        const dateScanned = this.getDateScanned();
        if (
            dateScanned.includes("Gerade Jetzt") ||
            dateScanned.includes("Minute") ||
            dateScanned.includes("Stunde") ||
            (dateScanned.includes("Tag") &&
                parseInt(dateScanned.split(" ")[0]) < GELBGRENZE)
        ) {
            return 0; // green
        } else if (
            dateScanned.includes("Tage") &&
            parseInt(dateScanned.split(" ")[0]) >= GELBGRENZE &&
            parseInt(dateScanned.split(" ")[0]) < ROTGRENZE
        ) {
            return 1; // yellow
        } else {
            return 2; // red
        }
    }
}
let technicians = techArr.map((initials) => new Technician(initials));
createDivs();
let swatches = document.querySelectorAll(".grid-item");
let activeSwatch = null;
let scannedData = "";

const removeActiveClass = () => {
    swatches.forEach((swatch) => swatch.classList.remove("active"));
    activeSwatch = null;
};

function addListeners() {
    swatches = document.querySelectorAll(".grid-item");
    swatches.forEach((swatch) => {
        swatch.addEventListener("click", () => {
            removeActiveClass();
            swatch.classList.add("active");

            activeSwatch = swatch;
        });
    });
}
addListeners();

const cleanInput = (input) => {
    loeschInput.forEach((key) => (input = input.split(key).join("")));
    return input;
};

let timeout;
document.addEventListener("keydown", (event) => {
    handleScan(event);
});

function handleKeyPress(event) {
    if (event.key !== "Enter") {
        scannedData += event.key;
    } else {
        processScannedData();
    }
}

function processScannedData() {
    const cleanedData = cleanInput(scannedData);
    const currentDate = new Date().toISOString();
    let existingItem;
    let swatchWithExistingItem;

    const swatches = Array.from(document.querySelectorAll(".grid-item"));
    swatchWithExistingItem = swatches.find((s) => {
        existingItem = Array.from(s.querySelectorAll("ul li")).find((li) =>
            li.textContent.startsWith(cleanedData)
        );
        return existingItem;
    });

    // const existingItem = Array.from(activeSwatch.querySelectorAll("ul li")).find(
    //     (li) => li.textContent.startsWith(cleanedData)
    // );
    console.log(activeSwatch);
    if (rentedItems.has(cleanedData) && activeSwatch !== null) {
        alert("Bereits geliehen von " + rentedItems.get(cleanedData));
        scannedData = "";
        removeActiveClass();
        return;
    }

    if (existingItem) {
        removeExistingItem(cleanedData, swatchWithExistingItem);
        scannedData = "";
        removeActiveClass();
        setPrios();
        updateColor();
        updateTimeDisplay();
        updateMap();
        return;
    }
    if (!activeSwatch) return;



    var arzt = prompt("Arzt");
    if (!arzt) {
        arzt = prompt("Arzt");
    }

    const newItem = new RentalObject(cleanedData, currentDate, arzt);

    updateSwatch(newItem);
    updateTechnicianData(newItem);
    scannedData = "";
    removeActiveClass();
    updateColor();
    updateTimeDisplay();
    updateMap();
}


function removeExistingItem(cleanedData, swatch) {
    const technicianInitials = swatch.textContent.trim().substring(0, 2);
    let technician = technicians.find(
        (tech) => tech.initials === technicianInitials
    );
    technician.removeRentalObject(cleanedData);
    localStorage.setItem(
        technicianInitials,
        JSON.stringify(
            technician.rentalObjects.map((obj) => ({
                serialNumber: obj.serialNumber,
                dateScanned: obj.dateScanned,
                arzt: obj.arzt,
            }))
        )
    );
}

function updateSwatch(newItem) {
    const existingItem = Array.from(activeSwatch.querySelectorAll("ul li")).find(
        (li) => li.textContent.startsWith(newItem.serialNumber)
    );
    if (existingItem) {
        existingItem.remove();
    } else {
        const listItem = document.createElement("li");
        const date = newItem.getDateScanned();
        const arzt = newItem.getArzt();

        listItem.textContent =
            newItem.serialNumber + " seit " + date + " bei " + arzt;
        activeSwatch.querySelector("ul").appendChild(listItem);
    }
}

function updateTechnicianData(newItem) {
    const technicianInitials = activeSwatch.textContent.trim().substring(0, 2);
    let technician = technicians.find(
        (tech) => tech.initials === technicianInitials
    );
    const existingItemIndex = technician.rentalObjects.findIndex(
        (item) => item.serialNumber === newItem.serialNumber
    );
    if (existingItemIndex !== -1) {
        technician.removeRentalObject(newItem.serialNumber);
    } else {
        technician.addRentalObject(newItem);
    }
    localStorage.setItem(
        technicianInitials,
        JSON.stringify(
            technician.rentalObjects.map((obj) => ({
                serialNumber: obj.serialNumber,
                dateScanned: obj.dateScanned,
                arzt: obj.arzt,
            }))
        )
    );
}

function updateSwatchDisplay(technician) {
    const swatches = Array.from(document.querySelectorAll(".grid-item"));
    const swatch = swatches.find(
        (s) => s.textContent.trim().substring(0, 2) === technician.initials
    );
    const list = swatch.querySelector("ul");
    list.innerHTML = "";

    technician.rentalObjects.forEach((rentalObject) => {
        const listItem = document.createElement("li");
        listItem.textContent =
            rentalObject.serialNumber +
            " seit " +
            rentalObject.getDateScanned() +
            " bei " +
            rentalObject.getArzt();
        list.appendChild(listItem);
    });
}

function populateTechnicianArrayfromLocalStorage() {

    const techs = Object.keys(localStorage);

    const uniqueTechs = new Set([...techs, ...BESTEHENDEKUERZEL]);

    return Array.from(uniqueTechs);
}

function loadTechnicianData() {
    technicians.forEach((technician) => {
        const storedData = localStorage.getItem(technician.initials);
        if (storedData) {
            technician.rentalObjects = JSON.parse(storedData).map(
                (obj) => new RentalObject(obj.serialNumber, obj.dateScanned, obj.arzt)
            );
            rentedItems = new Map([
                ...rentedItems,
                ...technician.rentalObjects.map((obj) => [
                    obj.serialNumber,
                    technician.initials,
                ]),
            ]);
        }

        updateSwatchDisplay(technician);
    });
}

function updateMap() {
    rentedItems = new Map();
    technicians.forEach((technician) => {
        technician.rentalObjects.forEach((obj) => {
            rentedItems.set(obj.serialNumber, technician.initials);
        });
    });
}

function setPrios() {
    for (let i = 0; i < technicians.length; i++) {
        technicians[i].setPrio();
    }
    sortTechniciansByPriority();
    createDivs();
    loadTechnicianData();
    addListeners();
}

function handleScan(event) {
    if (event.key === "/") {
        event.preventDefault();
    }

    event.preventDefault();
    clearTimeout(timeout);
    timeout = setTimeout(removeActiveClass, 500);


    handleKeyPress(event);

}

function removeTechnicianData(technicianInitials) {
    localStorage.removeItem(technicianInitials);
    technicians = technicians.filter(
        (tech) => tech.initials !== technicianInitials
    );
}

function removeTechnician(technicianInitials) {
    const technician = document.getElementById(technicianInitials);
    technician.remove();
    technicians = technicians.filter(
        (tech) => tech.initials !== technicianInitials
    );
    removeTechnicianData(technicianInitials);
}

function updateTimeDisplay() {
    technicians.forEach((technician) => {
        const swatches = Array.from(document.querySelectorAll(".grid-item"));
        const swatch = swatches.find(
            (s) => s.textContent.trim().substring(0, 2) === technician.initials
        );
        const listItems = swatch.querySelectorAll("li");
        listItems.forEach((listItem, index) => {
            listItem.textContent =
                technician.rentalObjects[index].serialNumber +
                " seit " +
                technician.rentalObjects[index].getDateScanned() +
                " bei " +
                technician.rentalObjects[index].getArzt();
        });
    });
    log("Time updated");
}

function getPriority(dateScanned) {
    if (
        dateScanned.includes("Gerade Jetzt") ||
        dateScanned.includes("Minute") ||
        dateScanned.includes("Stunde") ||
        (dateScanned.includes("Tag") &&
            parseInt(dateScanned.split(" ")[0]) < GELBGRENZE)
    ) {
        return 0; // green
    } else if (
        dateScanned.includes("Tage") &&
        parseInt(dateScanned.split(" ")[0]) >= GELBGRENZE &&
        parseInt(dateScanned.split(" ")[0]) < ROTGRENZE
    ) {
        return 1; // yellow
    } else {
        return 2; // red
    }
}

function updateSwatchClass(swatch, maxPriority) {
    swatch.classList.remove("green", "yellow", "red");

    if (maxPriority === 0) {
        swatch.classList.add("green");
    } else if (maxPriority === 1) {
        swatch.classList.add("yellow");
    } else {
        swatch.classList.add("red");
    }
    log("Color updated");
}

function updateColor() {
    const swatches = Array.from(document.querySelectorAll(".grid-item"));
    swatches.forEach((swatch) => {
        const listItems = swatch.querySelectorAll("li");
        let maxPriority = 0;

        listItems.forEach((listItem) => {
            const dateScanned = listItem.textContent
                .split("seit ")[1]
                .split(" bei")[0];
            const currentPriority = getPriority(dateScanned);
            maxPriority = Math.max(maxPriority, currentPriority);
        });

        updateSwatchClass(swatch, maxPriority);
    });
}

setInterval(updateTimeDisplay, 60000);
setInterval(updateColor, 60000);

function log(message) {
    if (LOG) {
        console.log(message);
    }
}

document.getElementById("addTechnician").addEventListener("click", function() {
    const initials = prompt("Initalien").toLocaleUpperCase();
    if (
        initials &&
        initials.length === KUERZELLAENGE &&
        !technicians.find((tech) => tech.initials === initials)
    ) {
        const newTechnician = new Technician(initials);
        technicians.push(newTechnician);
        createDiv(newTechnician.initials);
        localStorage.setItem(initials, JSON.stringify([]), newTechnician.prio);
        addListeners();
    } else if (technicians.find((tech) => tech.initials === initials)) {
        alert("Techniker existiert bereits");
    } else {
        alert("Fehlerhafte Eingabe");
    }
});

document
    .getElementById("removeTechnician")
    .addEventListener("click", function() {
        const initials = prompt("Initalien");
        if (initials) {
            removeTechnician(initials);
        }
    });

document.getElementById("reset").addEventListener("click", function() {
    const confirmation = confirm("Sicher?");
    if (confirmation) {
        const confirmation2 = confirm("Wirklich sicher?");
        if (confirmation2) {
            localStorage.clear();
            location.reload();
        }
    }
});

document.getElementById("export").addEventListener("click", exportBackup);

function exportBackup() {
    const data = JSON.stringify(
        technicians.map((tech) => ({
            initials: tech.initials,
            rentalObjects: tech.rentalObjects,
            arzt: tech.arzt,
        }))
    );
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "backup" + new Date().toISOString() + ".json";
    a.click();
    URL.revokeObjectURL(url);
}

document.getElementById("import").addEventListener("click", importBackup);

function importBackup() {
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.addEventListener("change", function(event) {
        const file = event.target.files[0];
        const reader = new FileReader();
        reader.onload = function() {
            const data = JSON.parse(reader.result);
            localStorage.clear();

            data.forEach((tech) => {
                const newTechnician = new Technician(tech.initials);
                technicians.push(newTechnician);
                tech.rentalObjects.forEach((obj) =>
                    newTechnician.addRentalObject(
                        new RentalObject(obj.serialNumber, obj.dateScanned)
                    )
                );
                localStorage.setItem(
                    tech.initials,
                    JSON.stringify(
                        tech.rentalObjects.map((obj) => ({
                            serialNumber: obj.serialNumber,
                            dateScanned: obj.dateScanned,
                            arzt: obj.arzt,
                        }))
                    ),
                    tech.prio
                );
            });
            location.reload();
        };
        reader.readAsText(file);
    });
    fileInput.click();
}

function createDivs() {
    clearSwatches();
    technicians.forEach((technician) => {
        createDiv(technician.initials);
    });
}

function createDiv(initials) {
    const gridContainer = document.querySelector(".grid-container");
    const technicianDiv = document.createElement("div");
    technicianDiv.className = "grid-item green";
    technicianDiv.id = initials;

    const p = document.createElement("p");
    p.textContent = initials;
    p.id = "initials";
    technicianDiv.appendChild(p);

    const ul = document.createElement("ul");
    technicianDiv.appendChild(ul);

    gridContainer.appendChild(technicianDiv);
}

window.onbeforeunload = function() {
    if (!LOG) {
        return false;
    }
};

function sortTechniciansByPriority() {
    technicians.sort((a, b) => b.prio - a.prio);
}

function clearSwatches() {
    const gridContainer = document.querySelector(".grid-container");
    while (gridContainer.firstChild) {
        gridContainer.removeChild(gridContainer.firstChild);
    }
}
let timer;

window.addEventListener("keyup", function(event) {
    if (timer) {
        clearTimeout(timer);
    }

    timer = setTimeout(function() {
        scannedData = "";
    }, 5000);
});

document.getElementById("slider").addEventListener("click", function() {
    const elementIds = ["addTechnician", "removeTechnician", "reset", "export", "import"];

    elementIds.forEach(id => {
        const element = document.getElementById(id);
        element.classList.toggle("hidden");
    });
});

function setCookie(name, value, days) {
    var expires = "";
    if (days) {
        var date = new Date();
        date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
        expires = "; expires=" + date.toUTCString();
    }
    document.cookie = name + "=" + (value || "") + expires + "; path=/";
}

function getCookie(name) {
    var nameEQ = name + "=";
    var ca = document.cookie.split(';');
    for (var i = 0; i < ca.length; i++) {
        var c = ca[i];
        while (c.charAt(0) == ' ') c = c.substring(1, c.length);
        if (c.indexOf(nameEQ) == 0) return c.substring(nameEQ.length, c.length);
    }
    return null;
}

function autoExportBackup() {
    const lastBackupDate = getCookie('lastBackupDate');
    const currentDate = new Date();

    if (!lastBackupDate || currentDate - new Date(lastBackupDate) > backupFrequency) {
        exportBackup();
        setCookie('lastBackupDate', currentDate.toString(), backupFrequency / (24 * 60 * 60 * 1000));
    }
}

document.querySelector(".grid-container").addEventListener("click", function(event) {
    if (!event.target.classList.contains('grid-item')) {
        removeActiveClass();
        log('removed');
    }
});