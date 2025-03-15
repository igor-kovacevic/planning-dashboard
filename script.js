document.addEventListener('DOMContentLoaded', () => {
    console.log('Dashboard loaded');

    // Object to store epic assignments (epic ID -> { developer: name, analyst: name })
    let assignments = {};
    let epicData = [];
    let resourceData = [];

    // Function to save assignments to localStorage
    function saveAssignments() {
        localStorage.setItem('epicAssignments', JSON.stringify(assignments));
    }

    // Function to load assignments from localStorage
    function loadAssignmentsFromStorage() {
        const stored = localStorage.getItem('epicAssignments');
        if (stored) {
            assignments = JSON.parse(stored);
            updateAllResourceCapacities();
            loadTeams(epicData, resourceData);
            document.querySelectorAll('.sidebar .epic').forEach(epicDiv => {
                const epicTitle = epicDiv.querySelector('h3').textContent;
                const epic = epicData.find(e => e.title === epicTitle);
                if (epic && assignments[epic.id]) {
                    epicDiv.classList.add('assigned');
                    updateEpicEffortStyles(epic.id, epicDiv);
                }
            });
        }
    }

    fetch('data.json')
        .then(response => response.json())
        .then(data => {
            epicData = data.epics;
            resourceData = data.resources;
            loadEpics(data.epics);
            loadResources(data.resources);
            loadTeams(data.epics, data.resources);

            // Load assignments from localStorage on initial load
            loadAssignmentsFromStorage();

            // Add export functionality
            const exportLink = document.getElementById('export-csv');
            exportLink.addEventListener('click', (e) => {
                e.preventDefault();
                exportToCSV();
            });

            // Add load functionality
            const loadLink = document.getElementById('load-assignments');
            loadLink.addEventListener('click', (e) => {
                e.preventDefault();
                loadAssignmentsFromStorage();
            });
        })
        .catch(error => console.error('Error loading data:', error));


        function loadResources(resourcesData) {
            const resourcesContainer = document.querySelector('.resources');
            resourcesContainer.innerHTML = '';
            resourcesData.forEach(resource => {
                const fullName = `${resource.firstName} ${resource.lastName}`;
                const resourceDiv = document.createElement('div');
                resourceDiv.className = 'resource visible';
                resourceDiv.dataset.name = fullName;
                updateResourceCapacity(resourceDiv, resource, []); // Initial load
                resourcesContainer.appendChild(resourceDiv);
        
                resourceDiv.addEventListener('click', () => {
                    selectResource(fullName);
                });
            });
        
            const searchInput = document.getElementById('resource-search');
            searchInput.addEventListener('input', (e) => {
                const searchTerm = e.target.value.toLowerCase();
                const resources = document.querySelectorAll('.resource');
                resources.forEach(resource => {
                    const name = resource.querySelector('h4').textContent.toLowerCase();
                    if (name.includes(searchTerm)) {
                        resource.classList.remove('hidden');
                        resource.classList.add('visible');
                    } else {
                        resource.classList.remove('visible');
                        resource.classList.add('hidden');
                    }
                });
            });
        }

    function loadTeams(epicsData, resourcesData) {
        const teamsContainer = document.querySelector('.teams');
        teamsContainer.innerHTML = '<h3>Teams</h3>';
        const teamEfforts = {};

        resourcesData.forEach(resource => {
            if (!teamEfforts[resource.team]) {
                teamEfforts[resource.team] = { analysis: 0, development: 0 };
            }
        });

        Object.entries(assignments).forEach(([epicId, roles]) => {
            const epic = epicsData.find(e => e.id === epicId);
            if (epic) {
                if (roles.analyst) {
                    const analyst = resourcesData.find(r => `${r.firstName} ${r.lastName}` === roles.analyst);
                    if (analyst) teamEfforts[analyst.team].analysis += epic.effortAnalysis;
                }
                if (roles.developer) {
                    const developer = resourcesData.find(r => `${r.firstName} ${r.lastName}` === roles.developer);
                    if (developer) teamEfforts[developer.team].development += epic.effortDevelopment;
                }
            }
        });

        Object.entries(teamEfforts).forEach(([teamName, efforts]) => {
            const teamDiv = document.createElement('div');
            teamDiv.className = 'team';
            teamDiv.innerHTML = `
                <h4>${teamName}</h4>
                <p>Analysis: ${efforts.analysis} days | Development: ${efforts.development} days</p>
            `;
            teamsContainer.appendChild(teamDiv);
        });
    }


let currentDraggedEpic = null;

function loadEpics(epicsData) {
    const epicsContainer = document.querySelector('.sidebar .epics');
    epicsContainer.innerHTML = '';
    epicsData.forEach(epic => {
        const epicDiv = document.createElement('div');
        epicDiv.className = 'epic';
        epicDiv.setAttribute('draggable', true);
        epicDiv.innerHTML = `
            <h3>${epic.title}</h3>
            <p class="description">${epic.description}</p>
            <a href="${epic.url}" class="url" target="_blank">${epic.url}</a>
            <div class="estimates">
                <span class="analysis-effort" data-epic-id="${epic.id}">Analysis: ${epic.effortAnalysis} days</span>
                <span class="development-effort" data-epic-id="${epic.id}">Development: ${epic.effortDevelopment} days</span>
                <span>Priority: ${epic.priority}</span>
                <span>Team: ${epic.team}</span>
            </div>
        `;
        epicsContainer.appendChild(epicDiv);

        epicDiv.addEventListener('dragstart', (e) => {
            currentDraggedEpic = epic; // Store the entire epic object
            console.log('Dragstart - Epic:', epic.id, 'Role:', epicDiv.dataset.role || 'developer'); // Debug
            epicDiv.classList.add('dragging');
            const dragGhost = epicDiv.cloneNode(true);
            dragGhost.style.opacity = '0.1';
            dragGhost.style.position = 'absolute';
            dragGhost.style.top = '-1000px';
            document.body.appendChild(dragGhost);
            e.dataTransfer.setDragImage(dragGhost, 0, 0);
            setTimeout(() => document.body.removeChild(dragGhost), 0);
        });

        epicDiv.addEventListener('dragend', (e) => {
            epicDiv.classList.remove('dragging');
            currentDraggedEpic = null; // Clear when drag ends
        });

        const analysisSpan = epicDiv.querySelector('.analysis-effort');
        const developmentSpan = epicDiv.querySelector('.development-effort');
        analysisSpan.addEventListener('click', () => {
            const assignedAnalyst = assignments[epic.id]?.analyst;
            if (assignedAnalyst) {
                selectResource(assignedAnalyst);
            }
            epicDiv.dataset.role = 'analyst'; // Track role for effort
        });
        developmentSpan.addEventListener('click', () => {
            const assignedDeveloper = assignments[epic.id]?.developer;
            if (assignedDeveloper) {
                selectResource(assignedDeveloper);
            }
            epicDiv.dataset.role = 'developer'; // Track role for effort
        });

        updateEpicEffortStyles(epic.id, epicDiv);
    });
}

function updateResourceCapacity(resourceDiv, resource, assignedEpics) {
    const fullName = `${resource.firstName} ${resource.lastName}`;
    const maxCapacity = 65; // 65 days in the quarter
    let dayAssignments = new Array(maxCapacity).fill(false); // Track assigned days
    const startDate = new Date('2025-01-01'); // Start of Q1 2025 (adjust as needed)

    assignedEpics.forEach(epicId => {
        const epic = epicData.find(e => e.id === epicId);
        if (epic && epic.startDay !== undefined) {
            const effort = resource.role === 'developer' ? epic.effortDevelopment : epic.effortAnalysis;
            for (let i = epic.startDay; i < epic.startDay + effort && i < maxCapacity; i++) {
                dayAssignments[i] = true;
            }
        }
    });

    const totalAssigned = dayAssignments.filter(Boolean).length;
    const available = maxCapacity - totalAssigned;

    let capacityHTML = '<div class="capacity">';
    for (let i = 0; i < maxCapacity; i++) {
        const currentDate = new Date(startDate);
        currentDate.setDate(startDate.getDate() + i);
        const dateString = currentDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        capacityHTML += `
            <div class="day-bar${dayAssignments[i] ? ' assigned' : ''}" data-day="${i}">
                <span class="tooltip">${dateString}</span>
            </div>`;
    }
    capacityHTML += '</div>';

    resourceDiv.innerHTML = `
        <h4>${fullName} (${resource.role})</h4>
        ${capacityHTML}
        <p>Assigned: ${totalAssigned} days | Available: ${available} days | Team: ${resource.team}</p>
    `;

    const dayBars = resourceDiv.querySelectorAll('.day-bar');
    dayBars.forEach(dayBar => {
        dayBar.addEventListener('dragover', (e) => {
            e.preventDefault();
            dayBar.classList.add('drag-over');
            const startDay = parseInt(dayBar.dataset.day);
            if (currentDraggedEpic) {
                const effort = resource.role === 'developer' ? currentDraggedEpic.effortDevelopment : currentDraggedEpic.effortAnalysis;
                console.log('Dragover - Epic:', currentDraggedEpic.id, 'Effort:', effort, 'Start Day:', startDay); // Debug

                // Highlight subsequent days using nextElementSibling
                let currentBar = dayBar;
                for (let i = 1; i < effort && currentBar && startDay + i < maxCapacity; i++) {
                    currentBar = currentBar.nextElementSibling;
                    if (currentBar) {
                        currentBar.classList.add('will-be-assigned');
                    }
                }
            }
        });

        dayBar.addEventListener('dragleave', (e) => {
            dayBar.classList.remove('drag-over');
            let currentBar = dayBar;
            for (let i = 1; i < maxCapacity - parseInt(dayBar.dataset.day) && currentBar; i++) {
                currentBar = currentBar.nextElementSibling;
                if (currentBar) {
                    currentBar.classList.remove('will-be-assigned');
                } else {
                    break;
                }
            }
        });

        dayBar.addEventListener('drop', (e) => {
            e.preventDefault();
            dayBar.classList.remove('drag-over');
            let currentBar = dayBar;
            for (let i = 1; i < maxCapacity - parseInt(dayBar.dataset.day) && currentBar; i++) {
                currentBar = currentBar.nextElementSibling;
                if (currentBar) {
                    currentBar.classList.remove('will-be-assigned');
                } else {
                    break;
                }
            }
            if (currentDraggedEpic) {
                const epicId = currentDraggedEpic.id;
                const startDay = parseInt(dayBar.dataset.day);
                console.log('Drop - Epic:', epicId, 'Start Day:', startDay); // Debug
                assignEpic(epicId, fullName, resource.role, startDay);
                selectResource(fullName);
                loadTeams(epicData, resourceData);
            } else {
                console.error('No epic being dragged during drop');
            }
        });
    });
}
// Update assignEpic function to include startDay
function assignEpic(epicId, resourceName, role, startDay) {
    if (!assignments[epicId]) assignments[epicId] = {};
    const resource = resourceData.find(r => `${r.firstName} ${r.lastName}` === resourceName);
    if (role === 'developer' && !assignments[epicId].developer) {
        assignments[epicId].developer = resourceName;
        assignments[epicId].developerStartDay = startDay;
    } else if (role === 'analyst' && !assignments[epicId].analyst) {
        assignments[epicId].analyst = resourceName;
        assignments[epicId].analystStartDay = startDay;
    }
    const epic = epicData.find(e => e.id === epicId);
    epic.startDay = role === 'developer' ? assignments[epicId].developerStartDay : assignments[epicId].analystStartDay;
    const sidebarEpic = Array.from(document.querySelectorAll('.sidebar .epic')).find(epic => 
        epic.querySelector('h3').textContent === getEpicTitleById(epicId));
    if (sidebarEpic) {
        sidebarEpic.classList.add('assigned');
        updateEpicEffortStyles(epicId, sidebarEpic);
    }
    updateAllResourceCapacities();
    saveAssignments();
}

// Update removeAssignment function to handle startDay
function removeAssignment(epicId, role) {
    if (!assignments[epicId]) return;
    const resourceName = assignments[epicId][role];
    delete assignments[epicId][role];
    delete assignments[epicId][role === 'developer' ? 'developerStartDay' : 'analystStartDay'];
    const epic = epicData.find(e => e.id === epicId);
    if (epic && !assignments[epicId]?.developer && !assignments[epicId]?.analyst) {
        delete epic.startDay;
    }
    if (!assignments[epicId].developer && !assignments[epicId].analyst) {
        delete assignments[epicId];
    }
    const sidebarEpic = Array.from(document.querySelectorAll('.sidebar .epic')).find(epic => 
        epic.querySelector('h3').textContent === getEpicTitleById(epicId));
    if (sidebarEpic) {
        if (!assignments[epicId]) sidebarEpic.classList.remove('assigned');
        updateEpicEffortStyles(epicId, sidebarEpic);
    }
    if (resourceName) {
        const selectedResource = document.querySelector('.resource.selected');
        if (selectedResource && selectedResource.dataset.name === resourceName) {
            showResourceDetails(resourceName);
        }
    }
    updateAllResourceCapacities();
    loadTeams(epicData, resourceData);
    saveAssignments();
}
// Update updateAllResourceCapacities function
function updateAllResourceCapacities() {
    const resources = document.querySelectorAll('.resource');
    resources.forEach(resourceDiv => {
        const resourceName = resourceDiv.dataset.name;
        const resource = resourceData.find(r => `${r.firstName} ${r.lastName}` === resourceName);
        const assignedEpics = Object.entries(assignments)
            .filter(([_, roles]) => roles.developer === resourceName || roles.analyst === resourceName)
            .map(([epicId]) => epicId);
        updateResourceCapacity(resourceDiv, resource, assignedEpics);
    });
}

    function selectResource(name) {
        document.querySelectorAll('.resource').forEach(resource => {
            resource.classList.remove('selected');
        });
        const resourceDiv = Array.from(document.querySelectorAll('.resource')).find(
            resource => resource.dataset.name === name
        );
        if (resourceDiv) {
            resourceDiv.classList.add('selected');
            showResourceDetails(name);
        }
    }

    function showResourceDetails(name) {
        const assignedEpics = Object.entries(assignments)
            .filter(([_, roles]) => roles.developer === name || roles.analyst === name)
            .map(([epicId]) => epicId);
        
        let detailsContent = `<h3>Resource: ${name}</h3><div class="epics">`;
        if (assignedEpics.length === 0) {
            detailsContent += `<p>No epics assigned to ${name}.</p>`;
        } else {
            assignedEpics.forEach(epicId => {
                const epic = getEpicById(epicId);
                const role = assignments[epicId].developer === name ? 'developer' : 'analyst';
                if (epic) {
                    detailsContent += `
                        <div class="epic">
                            <h3>${epic.title} <button class="delete-btn" data-epic="${epicId}" data-role="${role}">🗑️ Delete</button></h3>
                            <p class="description">${epic.description}</p>
                            <a href="${epic.url}" class="url" target="_blank">${epic.url}</a>
                            <div class="estimates">
                                <span>Analysis: ${epic.effortAnalysis} days</span>
                                <span>Development: ${epic.effortDevelopment} days</span>
                                <span>Priority: ${epic.priority}</span>
                                <span>Team: ${epic.team}</span>
                            </div>
                        </div>
                    `;
                }
            });
        }
        detailsContent += `</div>`;
        detailsDiv.innerHTML = detailsContent;

        const deleteButtons = detailsDiv.querySelectorAll('.delete-btn');
        deleteButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const epicId = btn.getAttribute('data-epic');
                const role = btn.getAttribute('data-role');
                removeAssignment(epicId, role);
            });
        });

        detailsDiv.classList.remove('hidden');
        detailsDiv.classList.add('visible');
    }

    function updateEpicEffortStyles(epicId, epicDiv) {
        const analysisSpan = epicDiv.querySelector('.analysis-effort');
        const developmentSpan = epicDiv.querySelector('.development-effort');
        const hasAnalyst = assignments[epicId]?.analyst;
        const hasDeveloper = assignments[epicId]?.developer;

        analysisSpan.classList.toggle('assigned', !!hasAnalyst);
        analysisSpan.classList.toggle('unassigned', !hasAnalyst);
        developmentSpan.classList.toggle('assigned', !!hasDeveloper);
        developmentSpan.classList.toggle('unassigned', !hasDeveloper);
    }

    function exportToCSV() {
        let csvContent = "data:text/csv;charset=utf-8,";
        const headers = ["Epic ID", "Epic Title", "Resource Name", "Capacity Allocated"];
        csvContent += headers.join(",") + "\r\n";

        Object.entries(assignments).forEach(([epicId, roles]) => {
            const epic = getEpicById(epicId);
            if (!epic) return;

            // Developer row
            if (roles.developer) {
                const developer = resourceData.find(r => `${r.firstName} ${r.lastName}` === roles.developer);
                if (developer) {
                    const row = [
                        epicId,
                        `"${epic.title}"`, // Quote title to handle commas
                        `"${roles.developer}"`, // Quote name to handle commas
                        epic.effortDevelopment
                    ];
                    csvContent += row.join(",") + "\r\n";
                }
            }

            // Analyst row
            if (roles.analyst) {
                const analyst = resourceData.find(r => `${r.firstName} ${r.lastName}` === roles.analyst);
                if (analyst) {
                    const row = [
                        epicId,
                        `"${epic.title}"`,
                        `"${roles.analyst}"`,
                        epic.effortAnalysis
                    ];
                    csvContent += row.join(",") + "\r\n";
                }
            }
        });

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", "epic_assignments.csv");
        document.body.appendChild(link); // Required for Firefox
        link.click();
        document.body.removeChild(link);
    }

    function getEpicById(id) {
        return epicData.find(epic => epic.id === id);
    }

    function getEpicTitleById(id) {
        const epic = getEpicById(id);
        return epic ? epic.title : id;
    }

    const detailsDiv = document.querySelector('.details');
});